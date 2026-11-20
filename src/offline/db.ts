import Dexie, { type Table } from 'dexie';

/**
 * Local database (IndexedDB via Dexie). One database per signed-in person and
 * business, so switching account or business never mixes data.
 *
 * Every change is written here first, together with an outbox entry, in one
 * transaction. The sync engine later sends the outbox to the server.
 */

/** Where a local record stands relative to the cloud. */
export type SyncMark = 'synced' | 'pending' | 'conflict' | 'rejected';

export interface CustomerRecord {
  id: string;
  tenant_id: string;
  name: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  notes: string | null;
  /** Server version; 0 until the server has accepted the record. */
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  _sync: SyncMark;
  /** Why the server refused the last change, when _sync is "rejected". */
  _message?: string;
}

export const CUSTOMER_FIELDS = ['name', 'business_name', 'email', 'phone', 'address', 'gstin', 'notes'] as const;
export type CustomerField = (typeof CUSTOMER_FIELDS)[number];
export type CustomerInput = { name: string } & Partial<Record<Exclude<CustomerField, 'name'>, string | null>>;

export type MutationType = 'customer.create' | 'customer.update' | 'customer.delete';

export interface OutboxEntry {
  seq?: number;
  mutationId: string;
  type: MutationType;
  entityId: string;
  payload: {
    changes?: Record<string, unknown>;
    base?: Record<string, unknown>;
    baseVersion?: number;
  };
  createdAt: string;
  attempts: number;
  /** pending: waiting to be sent. rejected: the server refused it (kept for review). */
  status: 'pending' | 'rejected';
  reason?: string;
  message?: string;
}

export interface ConflictRecord {
  /** The mutation id that conflicted. */
  id: string;
  type: MutationType;
  entityId: string;
  reason: string;
  fields: string[];
  /** The values this device tried to save. */
  mine: Record<string, unknown>;
  /** The record as the server has it. */
  theirs: Record<string, unknown>;
  createdAt: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class JobFlowDB extends Dexie {
  customers!: Table<CustomerRecord, string>;
  outbox!: Table<OutboxEntry, number>;
  conflicts!: Table<ConflictRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name: string) {
    super(name);
    // Schema migrations: add a new version() block, never edit an old one.
    this.version(1).stores({
      customers: 'id, name, updated_at, _sync',
      outbox: '++seq, &mutationId, entityId, status',
      conflicts: 'id, entityId',
      meta: 'key',
    });
  }
}

export function localDbName(userId: string, tenantId: string): string {
  return `jobflow_${userId}_${tenantId}`;
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC 4122 v4 from getRandomValues (older browsers)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Ask the browser not to clear our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // Not supported: data is still stored, just less protected.
  }
  return false;
}

export async function getMeta<T>(db: JobFlowDB, key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key);
  return row ? (row.value as T) : fallback;
}
