import type { Table } from 'dexie';
import type { JobFlowDB, MutationType, OutboxEntry, SyncMark } from './db';

/**
 * Server table name -> local table, and which mutations own its rows.
 * Child tables (stages, events) follow their parent's pending changes.
 */
export const SERVER_TABLES = [
  'customers',
  'employees',
  'workflows',
  'workflow_stages',
  'job_orders',
  'job_stages',
  'job_events',
] as const;
export type ServerTable = (typeof SERVER_TABLES)[number];

export function localTable(db: JobFlowDB, table: ServerTable): Table<Record<string, unknown>, string> {
  const map = {
    customers: db.customers,
    employees: db.employees,
    workflows: db.workflows,
    workflow_stages: db.workflowStages,
    job_orders: db.jobOrders,
    job_stages: db.jobStages,
    job_events: db.jobEvents,
  } as const;
  return map[table] as unknown as Table<Record<string, unknown>, string>;
}

/** The table holding the record a mutation is about. */
export function tableForMutation(type: MutationType): ServerTable {
  if (type.startsWith('customer.')) return 'customers';
  if (type.startsWith('employee.')) return 'employees';
  if (type.startsWith('workflow.')) return 'workflows';
  return 'job_orders';
}

type Row = Record<string, unknown> & { id: string };

async function pendingFor(db: JobFlowDB, entityId: string): Promise<OutboxEntry[]> {
  return (await db.outbox.where('entityId').equals(entityId).sortBy('seq')).filter((entry) => entry.status === 'pending');
}

const STAGE_RESULT: Record<string, string> = { start: 'in_progress', complete: 'done', skip: 'skipped', reopen: 'in_progress' };

/** Applies this device's unconfirmed changes on top of a row, in order. */
export function applyPending(table: ServerTable, row: Row, pending: OutboxEntry[]): Row {
  const local: Row = { ...row };
  for (const entry of pending) {
    if (table === 'job_stages') {
      if (entry.type === 'job.stage' && entry.payload.stageId === row.id && entry.payload.action) {
        local.status = STAGE_RESULT[entry.payload.action] ?? local.status;
      }
      continue;
    }
    if (entry.type.endsWith('.update') && entry.payload.changes) Object.assign(local, entry.payload.changes);
    if (entry.type.endsWith('.delete')) local.deleted_at = local.deleted_at ?? entry.createdAt;
    if (entry.type === 'workflow.save') {
      local.name = entry.payload.name ?? local.name;
      local.description = entry.payload.description ?? local.description;
    }
    if (entry.type === 'job.transition' && entry.payload.to) local.status = entry.payload.to;
    if (entry.type === 'job.stage' && local.status === 'approved') local.status = 'in_production';
  }
  return local;
}

/**
 * Makes the local copy = the server's row + this device's waiting changes.
 * Used for every push result and every downloaded row, inside a transaction.
 * Never drops a local change that is still waiting.
 */
export async function rebaseRow(db: JobFlowDB, table: ServerTable, serverRow: Row): Promise<void> {
  const { _txid: _ignored, ...row } = serverRow as Row & { _txid?: string };
  void _ignored;
  const target = localTable(db, table);

  if (table === 'job_events') {
    await target.put(row);
    return;
  }

  // Child rows follow the parent's waiting changes.
  const ownerId = table === 'job_stages' ? String(row.job_id) : table === 'workflow_stages' ? String(row.workflow_id) : row.id;
  const waiting = await pendingFor(db, ownerId);

  if (table === 'workflow_stages') {
    // While a workflow edit is waiting, keep this device's version of its stages.
    if (!waiting.some((entry) => entry.type === 'workflow.save')) await target.put({ ...row, _sync: 'synced' });
    return;
  }

  const local = applyPending(table, row, waiting);
  if (table === 'job_stages') {
    await target.put({ ...local, _sync: waiting.length > 0 ? 'pending' : 'synced' });
    return;
  }

  const rejected = await db.outbox
    .where('entityId')
    .equals(row.id)
    .filter((entry) => entry.status === 'rejected')
    .first();
  const conflicted = (await db.conflicts.where('entityId').equals(row.id).count()) > 0;

  let mark: SyncMark = 'synced';
  if (conflicted) mark = 'conflict';
  else if (rejected) mark = 'rejected';
  else if (waiting.length > 0) mark = 'pending';

  const next: Row = { ...local, _sync: mark };
  if (rejected?.message) next._message = rejected.message;
  else delete next._message;
  await target.put(next);

  // Steps shown on this device before the server confirmed them are replaced by the server's history.
  if (table === 'job_orders' && waiting.length === 0) {
    const localEvents = await db.jobEvents.where('job_id').equals(row.id).filter((event) => event._local === true).primaryKeys();
    await db.jobEvents.bulkDelete(localEvents);
  }
}

/** Customers keep their own entry point (used by conflict resolution). */
export async function rebaseCustomer(db: JobFlowDB, serverRow: Row): Promise<void> {
  await rebaseRow(db, 'customers', serverRow);
}
