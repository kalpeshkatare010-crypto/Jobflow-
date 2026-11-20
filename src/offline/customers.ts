import { allTables, CUSTOMER_FIELDS, newId, type CustomerInput, type CustomerRecord, type JobFlowDB, type OutboxEntry } from './db';
import { rebaseCustomer } from './rebase';

/**
 * Customer changes. Each function saves the record AND its outbox entry in one
 * IndexedDB transaction, so a change is either fully saved on the device or
 * not saved at all. Nothing here talks to the network.
 */

export class ValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Same rules as the database, so mistakes show up before syncing. */
export function normaliseCustomer(input: Partial<CustomerInput>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const field of CUSTOMER_FIELDS) {
    if (field in input) out[field] = clean(input[field]);
  }
  if ('gstin' in out && out.gstin) out.gstin = out.gstin.toUpperCase().replace(/\s+/g, '');
  if ('email' in out && out.email) out.email = out.email.toLowerCase();

  if ('name' in out && !out.name) throw new ValidationError('name', 'Enter the customer name.');
  if (out.name && out.name.length > 160) throw new ValidationError('name', 'Keep the name under 160 characters.');
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new ValidationError('email', 'Enter a valid email address.');
  if (out.phone && out.phone.length > 30) throw new ValidationError('phone', 'Keep the phone number under 30 characters.');
  if (out.gstin && !/^[0-9]{2}[A-Z0-9]{13}$/.test(out.gstin)) {
    throw new ValidationError('gstin', 'A GSTIN has 15 characters and starts with the 2-digit state code.');
  }
  if (out.address && out.address.length > 500) throw new ValidationError('address', 'Keep the address under 500 characters.');
  if (out.notes && out.notes.length > 2000) throw new ValidationError('notes', 'Keep notes under 2000 characters.');
  return out;
}

function outboxEntry(type: OutboxEntry['type'], entityId: string, payload: OutboxEntry['payload']): OutboxEntry {
  return {
    mutationId: newId(),
    type,
    entityId,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'pending',
  };
}

export async function createCustomer(db: JobFlowDB, tenantId: string, input: CustomerInput): Promise<string> {
  const values = normaliseCustomer(input);
  const id = newId();
  const now = new Date().toISOString();
  const record: CustomerRecord = {
    id,
    tenant_id: tenantId,
    name: values.name ?? '',
    business_name: values.business_name ?? null,
    email: values.email ?? null,
    phone: values.phone ?? null,
    address: values.address ?? null,
    gstin: values.gstin ?? null,
    notes: values.notes ?? null,
    version: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    _sync: 'pending',
  };
  await db.transaction('rw', db.customers, db.outbox, async () => {
    await db.customers.add(record);
    await db.outbox.add(outboxEntry('customer.create', id, { changes: values }));
  });
  return id;
}

/**
 * Saves only the fields that changed. `base` records each field's value
 * before this edit; the server uses it to merge edits from other devices.
 * Returns false when nothing changed.
 */
export async function updateCustomer(db: JobFlowDB, id: string, input: Partial<CustomerInput>): Promise<boolean> {
  const values = normaliseCustomer(input);
  return db.transaction('rw', db.customers, db.outbox, async () => {
    const current = await db.customers.get(id);
    if (!current || current.deleted_at) throw new ValidationError('id', 'This customer no longer exists.');
    const changes: Record<string, string | null> = {};
    const base: Record<string, string | null> = {};
    for (const [field, value] of Object.entries(values)) {
      const before = (current as unknown as Record<string, string | null>)[field] ?? null;
      if (before !== value) {
        changes[field] = value;
        base[field] = before;
      }
    }
    if (Object.keys(changes).length === 0) return false;
    await db.customers.put({ ...current, ...changes, updated_at: new Date().toISOString(), _sync: current._sync === 'conflict' ? 'conflict' : 'pending' });
    await db.outbox.add(outboxEntry('customer.update', id, { changes, base }));
    return true;
  });
}

export async function deleteCustomer(db: JobFlowDB, id: string): Promise<void> {
  await db.transaction('rw', db.customers, db.outbox, async () => {
    const current = await db.customers.get(id);
    if (!current || current.deleted_at) return;
    const now = new Date().toISOString();
    await db.customers.put({ ...current, deleted_at: now, updated_at: now, _sync: 'pending' });
    await db.outbox.add(outboxEntry('customer.delete', id, { baseVersion: current.version }));
  });
}

/**
 * Settles a conflict. "theirs" keeps the server's values; "mine" sends this
 * device's values again, now based on what the server has.
 */
export async function resolveCustomerConflict(db: JobFlowDB, conflictId: string, choice: 'mine' | 'theirs'): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict) return;
    await db.conflicts.delete(conflictId);

    if (choice === 'mine') {
      if (conflict.type === 'customer.delete') {
        await db.outbox.add(outboxEntry('customer.delete', conflict.entityId, { baseVersion: Number(conflict.theirs.version ?? 0) }));
      } else {
        const fields = conflict.fields.length > 0 ? conflict.fields : Object.keys(conflict.mine);
        const changes: Record<string, unknown> = {};
        const base: Record<string, unknown> = {};
        for (const field of fields) {
          changes[field] = conflict.mine[field] ?? null;
          base[field] = conflict.theirs[field] ?? null;
        }
        await db.outbox.add(outboxEntry('customer.update', conflict.entityId, { changes, base }));
      }
    }
    await rebaseCustomer(db, conflict.theirs as Record<string, unknown> & { id: string });
  });
}
