import { useLiveQuery } from 'dexie-react-hooks';
import type { CustomerRecord, JobEventRecord, JobFlowDB, JobRecord, JobStageRecord, ProductionEntryRecord } from '../../offline/db';
import { totals } from '../../offline/production';
import type { JobSummary } from '../../domain/jobs';
import type { StageSegment, StageState } from '../../components/ui/StageTrack';

export interface JobView {
  job: JobRecord;
  customer: CustomerRecord | undefined;
  stages: JobStageRecord[];
  /** Production entries for this job, voided ones included (newest first). */
  entries: ProductionEntryRecord[];
}

const STAGE_STATE: Record<JobStageRecord['status'], StageState> = {
  not_started: 'waiting',
  in_progress: 'current',
  done: 'done',
  skipped: 'skipped',
};

export function stageSegments(stages: JobStageRecord[]): StageSegment[] {
  return stages.map((stage) => ({ name: stage.name, state: STAGE_STATE[stage.status] }));
}

/** Parses a stored YYYY-MM-DD as a local calendar date. */
export function localDate(value: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** The business's jobs with their customers and stages, newest first. Updates live. */
export function useJobViews(db: JobFlowDB): JobView[] | undefined {
  return useLiveQuery(async () => {
    const [jobs, customers, stages, entries] = await Promise.all([
      db.jobOrders.toArray(),
      db.customers.toArray(),
      db.jobStages.toArray(),
      db.productionEntries.toArray(),
    ]);
    const entriesByJob = new Map<string, ProductionEntryRecord[]>();
    for (const entry of entries.sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))) {
      const list = entriesByJob.get(entry.job_id) ?? [];
      list.push(entry);
      entriesByJob.set(entry.job_id, list);
    }
    const customerById = new Map(customers.map((c) => [c.id, c]));
    const stagesByJob = new Map<string, JobStageRecord[]>();
    for (const stage of stages) {
      if (stage.deleted_at) continue;
      const list = stagesByJob.get(stage.job_id) ?? [];
      list.push(stage);
      stagesByJob.set(stage.job_id, list);
    }
    return jobs
      .filter((job) => !job.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((job) => ({
        job,
        customer: customerById.get(job.customer_id),
        stages: (stagesByJob.get(job.id) ?? []).sort((a, b) => a.position - b.position),
        entries: entriesByJob.get(job.id) ?? [],
      }));
  }, [db]);
}

export function useJobEvents(db: JobFlowDB, jobId: string | null): JobEventRecord[] | undefined {
  return useLiveQuery(
    async () => (jobId ? (await db.jobEvents.where('job_id').equals(jobId).toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)) : []),
    [db, jobId],
  );
}

/** Good and rejected totals per stage id. */
export function stageTotals(view: JobView): Map<string, { good: number; rejected: number }> {
  const map = new Map<string, { good: number; rejected: number }>();
  for (const stage of view.stages) map.set(stage.id, totals(view.entries.filter((e) => e.job_stage_id === stage.id)));
  return map;
}

/** What the dashboard and widgets need from a job. Produced = good output on the stage that counts as finished output. */
export function toSummary(view: JobView): JobSummary {
  const outputStages = new Set(view.stages.filter((s) => s.counts_output).map((s) => s.id));
  const all = totals(view.entries);
  const produced = totals(view.entries.filter((e) => outputStages.has(e.job_stage_id)));
  return {
    id: view.job.id,
    jobNumber: view.job.job_number ?? UNNUMBERED,
    title: view.job.title,
    customerName: view.customer?.name ?? 'Unknown customer',
    status: view.job.status,
    quantity: view.job.quantity,
    unit: view.job.unit,
    producedQty: produced.good,
    rejectedQty: all.rejected,
    dueDate: localDate(view.job.due_date) ?? new Date(8.64e15),
    priority: view.job.priority,
    stages: stageSegments(view.stages),
  };
}

/** Job numbers are given by the server, so a job made offline (or in demo mode) has none yet. */
export const UNNUMBERED = 'Not numbered yet';

export const PRIORITY_LABEL: Record<JobRecord['priority'], string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};
