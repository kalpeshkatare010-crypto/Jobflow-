import type { MutationResult, PullResponse, SyncApi, WireMutation } from '../../src/sync/engine';

type Row = Record<string, unknown> & { id: string; version: number; seq: number; deleted_at: string | null };

const FIELDS = ['name', 'business_name', 'email', 'phone', 'address', 'gstin', 'notes'];

/**
 * In-memory stand-in for sync_push / sync_pull with the same rules as the SQL
 * (idempotency by mutation id, field-level merge, conflicts). The SQL itself
 * is tested against PostgreSQL in tests/db.
 */
export function createFakeSyncServer() {
  const rows = new Map<string, Row>();
  const applied = new Map<string, MutationResult>();
  let seq = 0;
  let mode: 'ok' | 'down' | 'lose-response' = 'ok';
  const calls = { push: 0, pull: 0 };

  function publicRow(row: Row) {
    const { seq: _seq, ...rest } = row;
    void _seq;
    return rest;
  }

  function apply(m: WireMutation): MutationResult {
    const payload = (m.payload ?? {}) as { changes?: Record<string, unknown>; base?: Record<string, unknown>; baseVersion?: number };
    const changes = payload.changes ?? {};
    if (m.type === 'customer.create') {
      if (!changes.name) return { mutationId: m.mutationId, status: 'rejected', reason: 'invalid', message: 'Some details are missing or not valid.' };
      const row: Row = { id: m.entityId, tenant_id: 't', version: 1, seq: ++seq, deleted_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      for (const f of FIELDS) row[f] = (changes[f] as string | undefined) ?? null;
      rows.set(row.id, row);
      return { mutationId: m.mutationId, status: 'applied', row: publicRow(row) };
    }
    const row = rows.get(m.entityId);
    if (!row) return { mutationId: m.mutationId, status: 'rejected', reason: 'not_found', message: 'This customer no longer exists.' };
    if (m.type === 'customer.delete') {
      if (row.version > (payload.baseVersion ?? 0)) return { mutationId: m.mutationId, status: 'conflict', reason: 'edited_after_delete', row: publicRow(row) };
      Object.assign(row, { deleted_at: new Date().toISOString(), version: row.version + 1, seq: ++seq });
      return { mutationId: m.mutationId, status: 'applied', row: publicRow(row) };
    }
    const conflicts: string[] = [];
    const merged: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(changes)) {
      const current = row[field] ?? null;
      if (current === (payload.base?.[field] ?? null) || current === value) merged[field] = value;
      else conflicts.push(field);
    }
    if (Object.keys(merged).length > 0) Object.assign(row, merged, { version: row.version + 1, seq: ++seq });
    if (conflicts.length > 0) return { mutationId: m.mutationId, status: 'conflict', reason: 'same_field', fields: conflicts, row: publicRow(row) };
    return { mutationId: m.mutationId, status: 'applied', row: publicRow(row) };
  }

  /** A separate API object per device; all share this server. */
  function api(): SyncApi {
    return {
      async push(_tenantId, mutations) {
        calls.push += 1;
        if (mode === 'down') throw new TypeError('Failed to fetch');
        const results = mutations.map((m) => {
          const previous = applied.get(m.mutationId);
          if (previous) return previous;
          const result = apply(m);
          applied.set(m.mutationId, result);
          return result;
        });
        if (mode === 'lose-response') {
          mode = 'ok';
          throw new TypeError('Network connection was lost');
        }
        return results;
      },
      async pull(_tenantId, cursor): Promise<PullResponse> {
        calls.pull += 1;
        if (mode === 'down') throw new TypeError('Failed to fetch');
        const since = Number(cursor.seq ?? 0);
        const changed = [...rows.values()].filter((row) => row.seq > since).sort((a, b) => a.seq - b.seq);
        return { rows: { customers: changed.map(publicRow) }, hasMore: false, cursor: { seq } };
      },
    };
  }

  return {
    api,
    rows,
    calls,
    setMode(next: typeof mode) {
      mode = next;
    },
    /** Another device changes a field directly on the server. */
    edit(id: string, changes: Record<string, unknown>) {
      const row = rows.get(id);
      if (!row) throw new Error('no row');
      Object.assign(row, changes, { version: row.version + 1, seq: ++seq });
    },
  };
}
