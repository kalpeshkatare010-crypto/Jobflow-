import { allTables, newId, type JobFlowDB, type WorkflowStageRecord } from './db';
import { clean, outboxEntry } from './outbox';
import { ValidationError } from './customers';

export interface StageInput {
  /** Existing stage id; omitted for a new stage. */
  id?: string;
  name: string;
}

export interface WorkflowInput {
  id?: string;
  name: string;
  description?: string | null;
  stages: StageInput[];
  /** Index of the stage whose finished quantity counts as the job's output. Defaults to the last stage. */
  outputIndex?: number;
}

export const MAX_STAGES = 30;

/**
 * Saves a workflow and its ordered stages on the device and queues the
 * change. Jobs keep their own copy of stages, so this never changes running jobs.
 */
export async function saveWorkflow(db: JobFlowDB, tenantId: string, input: WorkflowInput): Promise<string> {
  const name = clean(input.name);
  if (!name) throw new ValidationError('name', 'Name the workflow, for example "Sheet metal parts".');
  if (name.length > 80) throw new ValidationError('name', 'Keep the name under 80 characters.');
  const stages = input.stages.map((stage) => ({ ...stage, name: clean(stage.name) ?? '' }));
  if (stages.length === 0) throw new ValidationError('stages', 'Add at least one stage.');
  if (stages.length > MAX_STAGES) throw new ValidationError('stages', `A workflow can have up to ${MAX_STAGES} stages.`);
  const blank = stages.findIndex((stage) => !stage.name);
  if (blank >= 0) throw new ValidationError('stages', `Name stage ${blank + 1}, or remove it.`);
  if (stages.some((stage) => stage.name.length > 60)) throw new ValidationError('stages', 'Keep stage names under 60 characters.');
  const output = input.outputIndex !== undefined && input.outputIndex < stages.length ? input.outputIndex : stages.length - 1;

  const id = input.id ?? newId();
  const description = clean(input.description);
  const now = new Date().toISOString();

  await db.transaction('rw', allTables(db), async () => {
    const current = await db.workflows.get(id);
    // Each save already waiting will raise the server's version by one.
    const waitingSaves = await db.outbox
      .where('entityId')
      .equals(id)
      .filter((entry) => entry.status === 'pending' && (entry.type === 'workflow.save' || entry.type === 'workflow.archive'))
      .count();
    const baseVersion = (current?.version ?? 0) + waitingSaves;

    const rows: WorkflowStageRecord[] = stages.map((stage, position) => ({
      id: stage.id ?? newId(),
      tenant_id: tenantId,
      workflow_id: id,
      name: stage.name,
      position,
      counts_output: position === output,
      version: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _sync: 'pending',
    }));

    await db.workflows.put({
      id,
      tenant_id: tenantId,
      name,
      description,
      archived_at: current?.archived_at ?? null,
      version: current?.version ?? 0,
      created_at: current?.created_at ?? now,
      updated_at: now,
      deleted_at: null,
      _sync: 'pending',
    });
    const keep = new Set(rows.map((row) => row.id));
    const old = await db.workflowStages.where('workflow_id').equals(id).toArray();
    for (const stage of old) {
      if (!keep.has(stage.id)) await db.workflowStages.put({ ...stage, deleted_at: now });
    }
    await db.workflowStages.bulkPut(rows);
    await db.outbox.add(
      outboxEntry('workflow.save', id, {
        name,
        description,
        baseVersion,
        stages: rows.map((row) => ({ id: row.id, name: row.name, position: row.position, counts_output: row.counts_output })),
      }),
    );
  });
  return id;
}

export async function setWorkflowArchived(db: JobFlowDB, id: string, archived: boolean): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const current = await db.workflows.get(id);
    if (!current) return;
    await db.workflows.put({ ...current, archived_at: archived ? new Date().toISOString() : null, _sync: 'pending' });
    await db.outbox.add(outboxEntry('workflow.archive', id, { archived }));
  });
}

/** Active stages of a workflow, in order. */
export async function stagesOf(db: JobFlowDB, workflowId: string): Promise<WorkflowStageRecord[]> {
  return (await db.workflowStages.where('workflow_id').equals(workflowId).toArray())
    .filter((stage) => !stage.deleted_at)
    .sort((a, b) => a.position - b.position);
}
