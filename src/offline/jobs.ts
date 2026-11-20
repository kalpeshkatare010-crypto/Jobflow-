import { allTables, newId, type JobFlowDB, type JobPriority, type JobRecord, type JobStageRecord, type JobStatusValue } from './db';
import { clean, outboxEntry } from './outbox';
import { ValidationError } from './customers';
import { stagesOf } from './workflows';
import { canMove } from '../domain/jobStatus';

export interface JobInput {
  customer_id: string;
  workflow_id: string;
  title: string;
  product_description?: string | null;
  quantity: number;
  unit: string;
  due_date?: string | null;
  priority?: JobPriority;
  notes?: string | null;
  instructions?: string | null;
  /** Save as a draft or approve straight away. */
  status?: 'draft' | 'approved';
}

export type JobEditInput = Partial<Omit<JobInput, 'workflow_id' | 'status'>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validate(input: Partial<JobInput>) {
  if ('customer_id' in input && !input.customer_id) throw new ValidationError('customer_id', 'Choose the customer.');
  if ('title' in input) {
    const title = clean(input.title);
    if (!title) throw new ValidationError('title', 'Name the job, for example "Mounting brackets 3 mm".');
    if (title.length > 160) throw new ValidationError('title', 'Keep the job name under 160 characters.');
  }
  if ('quantity' in input) {
    const q = Number(input.quantity);
    if (!Number.isFinite(q) || q <= 0) throw new ValidationError('quantity', 'Enter a quantity above zero.');
    if (q >= 1e10) throw new ValidationError('quantity', 'That quantity is too large.');
  }
  if ('unit' in input) {
    const unit = clean(input.unit);
    if (!unit) throw new ValidationError('unit', 'Choose the unit (pcs, kg, m...).');
    if (unit.length > 20) throw new ValidationError('unit', 'Keep the unit under 20 characters.');
  }
  if (input.due_date && !DATE.test(input.due_date)) throw new ValidationError('due_date', 'Enter the due date.');
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Creates a job on the device with its own copy of the workflow's stages.
 * The job number is given by the server when the job syncs.
 */
export async function createJob(db: JobFlowDB, tenantId: string, input: JobInput): Promise<string> {
  validate(input);
  if (!input.workflow_id) throw new ValidationError('workflow_id', 'Choose the workflow (the stages this job goes through).');
  const id = newId();
  const now = new Date().toISOString();

  await db.transaction('rw', allTables(db), async () => {
    const customer = await db.customers.get(input.customer_id);
    if (!customer || customer.deleted_at) throw new ValidationError('customer_id', 'Choose the customer.');
    const templates = await stagesOf(db, input.workflow_id);
    if (templates.length === 0) throw new ValidationError('workflow_id', 'This workflow has no stages yet.');

    const stages: JobStageRecord[] = templates.map((stage) => ({
      id: newId(),
      tenant_id: tenantId,
      job_id: id,
      name: stage.name,
      position: stage.position,
      counts_output: stage.counts_output,
      status: 'not_started',
      started_at: null,
      completed_at: null,
      version: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _sync: 'pending',
    }));

    const changes = {
      customer_id: input.customer_id,
      workflow_id: input.workflow_id,
      title: clean(input.title),
      product_description: clean(input.product_description),
      quantity: Number(input.quantity),
      unit: clean(input.unit),
      order_date: today(),
      due_date: input.due_date || null,
      priority: input.priority ?? 'normal',
      notes: clean(input.notes),
      instructions: clean(input.instructions),
      status: input.status ?? 'draft',
    };

    const job: JobRecord = {
      id,
      tenant_id: tenantId,
      job_number: null,
      customer_id: changes.customer_id,
      workflow_id: changes.workflow_id,
      title: changes.title ?? '',
      product_description: changes.product_description,
      quantity: changes.quantity,
      unit: changes.unit ?? '',
      order_date: changes.order_date,
      due_date: changes.due_date,
      priority: changes.priority,
      status: changes.status,
      held_from: null,
      notes: changes.notes,
      instructions: changes.instructions,
      completed_at: null,
      version: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _sync: 'pending',
    };

    await db.jobOrders.add(job);
    await db.jobStages.bulkAdd(stages);
    await db.jobEvents.add({
      id: newId(),
      tenant_id: tenantId,
      job_id: id,
      kind: 'created',
      from_status: null,
      to_status: job.status,
      stage_name: null,
      stage_action: null,
      reason: null,
      actor_name: null,
      created_at: now,
      _local: true,
    });
    await db.outbox.add(
      outboxEntry('job.create', id, {
        changes,
        stages: stages.map((stage) => ({ id: stage.id, name: stage.name, position: stage.position, counts_output: stage.counts_output })),
      }),
    );
  });
  return id;
}

/** Saves changed details only, with their previous values for the server's merge. */
export async function updateJob(db: JobFlowDB, id: string, input: JobEditInput): Promise<boolean> {
  validate(input);
  return db.transaction('rw', allTables(db), async () => {
    const current = await db.jobOrders.get(id);
    if (!current || current.deleted_at) throw new ValidationError('id', 'This job no longer exists.');
    const next: Record<string, unknown> = {};
    for (const [field, raw] of Object.entries(input)) {
      next[field] = field === 'quantity' ? Number(raw) : field === 'due_date' ? raw || null : typeof raw === 'string' ? clean(raw) : raw;
    }
    const changes: Record<string, unknown> = {};
    const base: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(next)) {
      const before = (current as unknown as Record<string, unknown>)[field] ?? null;
      if (before !== value) {
        changes[field] = value;
        base[field] = before;
      }
    }
    if (Object.keys(changes).length === 0) return false;
    await db.jobOrders.put({ ...current, ...changes, updated_at: new Date().toISOString(), _sync: 'pending' } as JobRecord);
    await db.outbox.add(outboxEntry('job.update', id, { changes, base }));
    return true;
  });
}

async function localEvent(db: JobFlowDB, job: JobRecord, event: Partial<{ kind: 'status' | 'stage'; from: string; to: string; stage: string; action: string; reason: string | null }>) {
  await db.jobEvents.add({
    id: newId(),
    tenant_id: job.tenant_id,
    job_id: job.id,
    kind: event.kind ?? 'status',
    from_status: event.from ?? null,
    to_status: event.to ?? null,
    stage_name: event.stage ?? null,
    stage_action: event.action ?? null,
    reason: event.reason ?? null,
    actor_name: null,
    created_at: new Date().toISOString(),
    _local: true,
  });
}

/** Moves a job to another status (checked again on the server). */
export async function moveJob(db: JobFlowDB, id: string, to: JobStatusValue, reason?: string): Promise<void> {
  const why = clean(reason);
  if (to === 'cancelled' && (!why || why.length < 3)) throw new ValidationError('reason', 'Give a reason for cancelling the job.');
  await db.transaction('rw', allTables(db), async () => {
    const job = await db.jobOrders.get(id);
    if (!job) throw new ValidationError('id', 'This job no longer exists.');
    if (!canMove(job.status, to)) throw new ValidationError('status', 'This job cannot move to that status now.');
    await db.jobOrders.put({
      ...job,
      status: to,
      held_from: to === 'on_hold' ? (job.status as 'approved' | 'in_production') : null,
      completed_at: to === 'completed' ? new Date().toISOString() : job.completed_at,
      _sync: 'pending',
    });
    await localEvent(db, job, { kind: 'status', from: job.status, to, reason: why });
    await db.outbox.add(outboxEntry('job.transition', id, { to, ...(why ? { reason: why } : {}) }));
  });
}

const STAGE_RESULT = { start: 'in_progress', complete: 'done', skip: 'skipped', reopen: 'in_progress' } as const;

/** Starts, finishes, skips or reopens one stage of a job. */
export async function stageStep(db: JobFlowDB, jobId: string, stageId: string, action: 'start' | 'complete' | 'skip' | 'reopen'): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const job = await db.jobOrders.get(jobId);
    const stage = await db.jobStages.get(stageId);
    if (!job || !stage) throw new ValidationError('id', 'This job no longer exists.');
    if (job.status !== 'approved' && job.status !== 'in_production') {
      throw new ValidationError('status', 'Approve the job, or resume it, before working on its stages.');
    }
    const now = new Date().toISOString();
    const status = STAGE_RESULT[action];
    await db.jobStages.put({
      ...stage,
      status,
      started_at: status === 'in_progress' ? (stage.started_at ?? now) : stage.started_at,
      completed_at: status === 'done' || status === 'skipped' ? now : null,
      _sync: 'pending',
    });
    if (job.status === 'approved') {
      await db.jobOrders.put({ ...job, status: 'in_production', _sync: 'pending' });
      await localEvent(db, job, { kind: 'status', from: 'approved', to: 'in_production' });
    }
    await localEvent(db, job, { kind: 'stage', stage: stage.name, action });
    await db.outbox.add(outboxEntry('job.stage', jobId, { stageId, action }));
  });
}

/** Clears a job conflict after the person has seen it (the server's version stays). */
export async function dismissConflict(db: JobFlowDB, conflictId: string): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict) return;
    await db.conflicts.delete(conflictId);
    const job = await db.jobOrders.get(conflict.entityId);
    if (job && job._sync === 'conflict') {
      const remaining = await db.conflicts.where('entityId').equals(conflict.entityId).count();
      const waiting = await db.outbox.where('entityId').equals(conflict.entityId).filter((e) => e.status === 'pending').count();
      if (remaining === 0) await db.jobOrders.put({ ...job, _sync: waiting > 0 ? 'pending' : 'synced' });
    }
  });
}
