/**
 * Pure job rules shared by the dashboard, reports and (from Milestone 5) the
 * server-validated job module. No I/O here, so every rule is unit-tested.
 */
import type { JobStatus } from '../components/ui/Badge';
import type { StageSegment } from '../components/ui/StageTrack';

export interface JobSummary {
  id: string;
  jobNumber: string;
  title: string;
  customerName: string;
  status: JobStatus;
  quantity: number;
  unit: string;
  /** Good output on the job's output stage. */
  producedQty: number;
  rejectedQty: number;
  dueDate: Date;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  stages: StageSegment[];
}

const CLOSED: ReadonlySet<JobStatus> = new Set(['completed', 'delivered', 'cancelled']);
const PENDING: ReadonlySet<JobStatus> = new Set(['draft', 'approved', 'on_hold']);

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Delayed = due date has passed and the job is not completed, delivered or cancelled. */
export function isDelayed(job: Pick<JobSummary, 'status' | 'dueDate'>, today: Date): boolean {
  return !CLOSED.has(job.status) && startOfDay(job.dueDate) < startOfDay(today);
}

export function isOpen(job: Pick<JobSummary, 'status'>): boolean {
  return !CLOSED.has(job.status);
}

/** Share of the order quantity produced on the output stage, capped at 100%. */
export function progress(job: Pick<JobSummary, 'producedQty' | 'quantity'>): number {
  if (job.quantity <= 0) return 0;
  return Math.min(1, Math.max(0, job.producedQty / job.quantity));
}

/** Rejected share of everything produced (good + rejected). */
export function rejectionRate(produced: number, rejected: number): number {
  const total = produced + rejected;
  return total <= 0 ? 0 : rejected / total;
}

export interface JobMetrics {
  total: number;
  pending: number;
  inProduction: number;
  completed: number;
  delayed: number;
}

export function computeJobMetrics(jobs: JobSummary[], today: Date): JobMetrics {
  const active = jobs.filter((job) => job.status !== 'cancelled');
  return {
    total: active.length,
    pending: jobs.filter((job) => PENDING.has(job.status)).length,
    inProduction: jobs.filter((job) => job.status === 'in_production').length,
    completed: jobs.filter((job) => job.status === 'completed' || job.status === 'delivered').length,
    delayed: jobs.filter((job) => isDelayed(job, today)).length,
  };
}

export const STATUS_ORDER: JobStatus[] = [
  'draft',
  'approved',
  'in_production',
  'on_hold',
  'completed',
  'delivered',
  'cancelled',
];

export function countByStatus(jobs: JobSummary[]): { status: JobStatus; count: number }[] {
  return STATUS_ORDER.map((status) => ({ status, count: jobs.filter((job) => job.status === status).length }));
}

/** Open jobs due within `withinDays` (overdue first), soonest first. */
export function upcomingDeadlines(jobs: JobSummary[], today: Date, withinDays = 7): JobSummary[] {
  const limit = startOfDay(today) + withinDays * 24 * 60 * 60 * 1000;
  return jobs
    .filter((job) => isOpen(job) && job.status !== 'draft' && startOfDay(job.dueDate) <= limit)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}
