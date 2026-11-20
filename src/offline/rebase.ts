import type { CustomerRecord, JobFlowDB, SyncMark } from './db';

type ServerRow = Omit<CustomerRecord, '_sync' | '_message'> & { _txid?: string };

/**
 * Makes the local copy = the server's row + this device's changes that the
 * server has not confirmed yet (in order). Called after every push result and
 * every downloaded row, inside a transaction covering customers, outbox and
 * conflicts. Never drops a local change that is still waiting.
 */
export async function rebaseCustomer(db: JobFlowDB, serverRow: ServerRow): Promise<void> {
  const { _txid: _ignored, ...row } = serverRow as ServerRow & Record<string, unknown>;
  void _ignored;
  const waiting = (await db.outbox.where('entityId').equals(row.id).sortBy('seq')).filter((entry) => entry.status === 'pending');
  const rejected = await db.outbox.where('entityId').equals(row.id).filter((entry) => entry.status === 'rejected').first();
  const conflicted = (await db.conflicts.where('entityId').equals(row.id).count()) > 0;

  const local: Record<string, unknown> = { ...row };
  for (const entry of waiting) {
    if (entry.type === 'customer.update' && entry.payload.changes) Object.assign(local, entry.payload.changes);
    if (entry.type === 'customer.delete') local.deleted_at = local.deleted_at ?? entry.createdAt;
  }

  let mark: SyncMark = 'synced';
  if (conflicted) mark = 'conflict';
  else if (rejected) mark = 'rejected';
  else if (waiting.length > 0) mark = 'pending';

  await db.customers.put({
    ...(local as unknown as CustomerRecord),
    _sync: mark,
    ...(rejected?.message ? { _message: rejected.message } : {}),
  });
}
