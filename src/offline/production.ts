import { allTables, newId, type JobFlowDB, type ProductionEntryRecord } from './db';
import { ValidationError } from './customers';
import { localEvent } from './jobs';
import { clean, outboxEntry } from './outbox';

export interface ProductionInput {
  jobId: string;
  stageId: string;
  employeeId: string | null;
  /** YYYY-MM-DD */
  date: string;
  good: number;
  rejected: number;
  reason?: string | null;
  notes?: string | null;
}

const MAX_QTY = 1_000_000_000;

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Same rules as the server, so mistakes show at once, even offline. */
export function validateProduction(input: ProductionInput, today = new Date()): void {
  const good = Number(input.good);
  const rejected = Number(input.rejected);
  if (!Number.isFinite(good) || !Number.isFinite(rejected) || good < 0 || rejected < 0) {
    throw new ValidationError('good', 'Quantities must be numbers of zero or more.');
  }
  if (good > MAX_QTY || rejected > MAX_QTY) throw new ValidationError('good', 'That quantity is too large.');
  if (good + rejected <= 0) throw new ValidationError('good', 'Enter a good or rejected quantity above zero.');
  if (rejected > 0 && (clean(input.reason)?.length ?? 0) < 2) {
    throw new ValidationError('reason', 'Give a reason for the rejected quantity.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new ValidationError('date', 'Choose a date.');
  const yearAgo = new Date(today);
  yearAgo.setDate(yearAgo.getDate() - 366);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (input.date > isoDay(tomorrow) || input.date < isoDay(yearAgo)) {
    throw new ValidationError('date', 'Choose a date within the last year.');
  }
}

/** Saves the entry on this device and queues it, in one transaction. Returns the entry id. */
export async function recordProduction(db: JobFlowDB, input: ProductionInput): Promise<string> {
  validateProduction(input);
  const id = newId();
  await db.transaction('rw', allTables(db), async () => {
    const job = await db.jobOrders.get(input.jobId);
    const stage = await db.jobStages.get(input.stageId);
    if (!job || !stage || stage.job_id !== job.id) throw new ValidationError('jobId', 'This job or stage no longer exists.');
    if (job.status === 'draft' || job.status === 'cancelled') {
      throw new ValidationError('jobId', job.status === 'draft' ? 'Approve the job before recording production.' : 'This job is cancelled.');
    }
    const now = new Date().toISOString();
    const good = Number(input.good);
    const rejected = Number(input.rejected);
    const reason = rejected > 0 ? clean(input.reason) : null;
    const notes = clean(input.notes);
    const entry: ProductionEntryRecord = {
      id,
      tenant_id: job.tenant_id,
      job_id: job.id,
      job_stage_id: stage.id,
      employee_id: input.employeeId,
      entry_date: input.date,
      good_qty: good,
      rejected_qty: rejected,
      rejection_reason: reason,
      notes,
      recorded_by_name: null,
      voided_at: null,
      void_reason: null,
      voided_by_name: null,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _sync: 'pending',
    };
    await db.productionEntries.add(entry);
    // Show the same effects the server will apply: the stage starts, an approved job goes into production.
    if (stage.status === 'not_started') {
      await db.jobStages.put({ ...stage, status: 'in_progress', started_at: stage.started_at ?? now });
      await localEvent(db, job, { kind: 'stage', stage: stage.name, action: 'start' });
    }
    if (job.status === 'approved') {
      await db.jobOrders.put({ ...job, status: 'in_production' });
      await localEvent(db, job, { kind: 'status', from: 'approved', to: 'in_production' });
    }
    await db.outbox.add(
      outboxEntry('production.record', id, {
        jobId: job.id,
        stageId: stage.id,
        employeeId: input.employeeId,
        date: input.date,
        good,
        rejected,
        reason: reason ?? undefined,
        notes,
      }),
    );
  });
  return id;
}

/** Cancels a wrong entry. Its numbers stay visible, crossed out, with the reason. */
export async function voidProduction(db: JobFlowDB, id: string, reason: string): Promise<void> {
  const why = clean(reason);
  if (!why || why.length < 3) throw new ValidationError('reason', 'Give a reason for voiding the entry.');
  await db.transaction('rw', allTables(db), async () => {
    const entry = await db.productionEntries.get(id);
    if (!entry) throw new ValidationError('id', 'This entry no longer exists.');
    if (entry.voided_at) return;
    await db.productionEntries.put({ ...entry, voided_at: new Date().toISOString(), void_reason: why, _sync: 'pending' });
    await db.outbox.add(outboxEntry('production.void', id, { reason: why }));
  });
}

/**
 * Removes an entry the server refused or could not record, after the person has seen why.
 * Only for entries that never reached the server.
 */
export async function discardUnrecordedEntry(db: JobFlowDB, id: string): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const entry = await db.productionEntries.get(id);
    if (!entry || (entry._sync !== 'rejected' && entry._sync !== 'conflict')) return;
    await db.productionEntries.delete(id);
    const queued = await db.outbox.where('entityId').equals(id).primaryKeys();
    await db.outbox.bulkDelete(queued);
    const conflicts = await db.conflicts.where('entityId').equals(id).primaryKeys();
    await db.conflicts.bulkDelete(conflicts);
  });
}

/** True for entries that count: not voided, and not refused by the server. */
export function counts(entry: Pick<ProductionEntryRecord, 'voided_at' | '_sync'>): boolean {
  return !entry.voided_at && entry._sync !== 'rejected' && entry._sync !== 'conflict';
}

/** Totals that ignore voided and unrecorded entries. */
export function totals(entries: Pick<ProductionEntryRecord, 'good_qty' | 'rejected_qty' | 'voided_at' | '_sync'>[]) {
  let good = 0;
  let rejected = 0;
  for (const e of entries) {
    if (!counts(e)) continue;
    good += Number(e.good_qty);
    rejected += Number(e.rejected_qty);
  }
  return { good, rejected };
}
