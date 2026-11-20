import { useLiveQuery } from 'dexie-react-hooks';
import type { CustomerRecord, JobEventRecord, JobFlowDB, JobRecord, JobStageRecord } from '../../offline/db';
import type { JobSummary } from '../../domain/jobs';
import type { StageSegment, StageState } from '../../components/ui/StageTrack';

export interface JobView {
  job: JobRecord;
  customer: CustomerRecord | undefined;
  stages: JobStageRecord[];
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
    const [jobs, customers, stages] = await Promise.all([db.jobOrders.toArray(), db.customers.toArray(), db.jobStages.toArray()]);
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
      }));
  }, [db]);
}

export function useJobEvents(db: JobFlowDB, jobId: string | null): JobEventRecord[] | undefined {
  return useLiveQuery(
    async () => (jobId ? (await db.jobEvents.where('job_id').equals(jobId).toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)) : []),
    [db, jobId],
  );
}

/** What the dashboard and widgets need from a job. Produced quantities arrive with production entries. */
export function toSummary(view: JobView): JobSummary {
  return {
    id: view.job.id,
    jobNumber: view.job.job_number ?? UNNUMBERED,
    title: view.job.title,
    customerName: view.customer?.name ?? 'Unknown customer',
    status: view.job.status,
    quantity: view.job.quantity,
    unit: view.job.unit,
    producedQty: 0,
    rejectedQty: 0,
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
