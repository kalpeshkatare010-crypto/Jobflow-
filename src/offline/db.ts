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

export type MutationType =
  | 'customer.create'
  | 'customer.update'
  | 'customer.delete'
  | 'employee.create'
  | 'employee.update'
  | 'employee.delete'
  | 'workflow.save'
  | 'workflow.archive'
  | 'job.create'
  | 'job.update'
  | 'job.transition'
  | 'job.stage';

/** Common shape of every synced row kept on the device. */
export interface SyncedRow {
  id: string;
  tenant_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  _sync: SyncMark;
  _message?: string;
}

export interface EmployeeRecord extends SyncedRow {
  name: string;
  employee_code: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface WorkflowRecord extends SyncedRow {
  name: string;
  description: string | null;
  archived_at: string | null;
}

export interface WorkflowStageRecord extends SyncedRow {
  workflow_id: string;
  name: string;
  position: number;
  counts_output: boolean;
}

export type JobStatusValue = 'draft' | 'approved' | 'in_production' | 'on_hold' | 'completed' | 'delivered' | 'cancelled';
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface JobRecord extends SyncedRow {
  /** Given by the server; null until the job has synced. */
  job_number: string | null;
  customer_id: string;
  workflow_id: string | null;
  title: string;
  product_description: string | null;
  quantity: number;
  unit: string;
  order_date: string;
  due_date: string | null;
  priority: JobPriority;
  status: JobStatusValue;
  held_from: 'approved' | 'in_production' | null;
  notes: string | null;
  instructions: string | null;
  completed_at: string | null;
}

export type JobStageStatus = 'not_started' | 'in_progress' | 'done' | 'skipped';

export interface JobStageRecord extends SyncedRow {
  job_id: string;
  name: string;
  position: number;
  counts_output: boolean;
  status: JobStageStatus;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobEventRecord {
  id: string;
  tenant_id: string;
  job_id: string;
  kind: 'created' | 'status' | 'stage' | 'edited';
  from_status: string | null;
  to_status: string | null;
  stage_name: string | null;
  stage_action: string | null;
  reason: string | null;
  actor_name: string | null;
  created_at: string;
  /** True for a step made on this device that the server has not confirmed yet. */
  _local?: boolean;
}

export interface OutboxEntry {
  seq?: number;
  mutationId: string;
  type: MutationType;
  entityId: string;
  payload: {
    changes?: Record<string, unknown>;
    base?: Record<string, unknown>;
    baseVersion?: number;
    /** workflow.save */
    name?: string;
    description?: string | null;
    stages?: Record<string, unknown>[];
    archived?: boolean;
    /** job.transition */
    to?: string;
    reason?: string;
    /** job.stage */
    stageId?: string;
    action?: 'start' | 'complete' | 'skip' | 'reopen';
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
  /** The server's explanation, for job steps that could not be applied. */
  message?: string;
  createdAt: string;
}

/** Every local table a sync transaction may touch. */
export function allTables(db: JobFlowDB) {
  return [db.customers, db.employees, db.workflows, db.workflowStages, db.jobOrders, db.jobStages, db.jobEvents, db.outbox, db.conflicts, db.meta];
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
  employees!: Table<EmployeeRecord, string>;
  workflows!: Table<WorkflowRecord, string>;
  workflowStages!: Table<WorkflowStageRecord, string>;
  jobOrders!: Table<JobRecord, string>;
  jobStages!: Table<JobStageRecord, string>;
  jobEvents!: Table<JobEventRecord, string>;

  constructor(name: string) {
    super(name);
    // Schema migrations: add a new version() block, never edit an old one.
    this.version(1).stores({
      customers: 'id, name, updated_at, _sync',
      outbox: '++seq, &mutationId, entityId, status',
      conflicts: 'id, entityId',
      meta: 'key',
    });
    this.version(2).stores({
      employees: 'id, name, _sync',
      workflows: 'id, name, _sync',
      workflowStages: 'id, workflow_id',
      jobOrders: 'id, status, due_date, customer_id, _sync',
      jobStages: 'id, job_id',
      jobEvents: 'id, job_id, created_at',
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
