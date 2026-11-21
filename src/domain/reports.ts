import type { EmployeeRecord, StockMovementRecord } from '../offline/db';
import { counts } from '../offline/production';
import type { JobView } from '../features/jobs/jobData';
import { toSummary } from '../features/jobs/jobData';
import type { MaterialView } from '../features/inventory/InventoryPage';
import { isDelayed } from './jobs';
import { rejectionShare } from './production';
import type { Cell } from './csv';

export interface Period {
  /** YYYY-MM-DD, inclusive */
  from: string;
  to: string;
}

const inPeriod = (date: string | null | undefined, p: Period) => !!date && date >= p.from && date <= p.to;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

export interface Report {
  title: string;
  headers: string[];
  rows: Cell[][];
  /** Short totals shown above the table. */
  totals: { label: string; value: string | number }[];
}

// -----------------------------------------------------------------------------
/** Jobs ordered in the period (or still open from before), with output and timeliness. */
export function jobsReport(views: JobView[], period: Period, today: Date): Report {
  const rows: Cell[][] = [];
  let produced = 0;
  let rejected = 0;
  let delayed = 0;
  let completed = 0;
  const list = views.filter((v) => inPeriod(v.job.order_date ?? day(v.job.created_at), period));
  for (const v of list) {
    const s = toSummary(v);
    const late = isDelayed(s, today);
    if (late) delayed += 1;
    if (v.job.status === 'completed' || v.job.status === 'delivered') completed += 1;
    produced += s.producedQty;
    rejected += s.rejectedQty;
    rows.push([
      v.job.job_number ?? 'Not numbered yet',
      v.job.title,
      v.customer?.name ?? '',
      v.job.status.replace('_', ' '),
      v.job.priority,
      v.job.order_date ?? day(v.job.created_at),
      v.job.due_date ?? '',
      day(v.job.completed_at),
      Number(v.job.quantity),
      s.producedQty,
      s.rejectedQty,
      v.job.unit,
      late ? 'Yes' : 'No',
    ]);
  }
  return {
    title: 'Jobs',
    headers: ['Job number', 'Job', 'Customer', 'Status', 'Priority', 'Order date', 'Due date', 'Completed', 'Quantity', 'Finished output', 'Rejected', 'Unit', 'Delayed'],
    rows,
    totals: [
      { label: 'Jobs', value: list.length },
      { label: 'Completed or delivered', value: completed },
      { label: 'Delayed now', value: delayed },
      { label: 'Rejection rate', value: `${Math.round(rejectionShare(produced, rejected) * 1000) / 10}%` },
    ],
  };
}

// -----------------------------------------------------------------------------
/** Every production entry in the period, voided ones marked. */
export function productionReport(views: JobView[], employees: EmployeeRecord[], period: Period): Report {
  const names = new Map(employees.map((e) => [e.id, e.name]));
  const rows: Cell[][] = [];
  let good = 0;
  let rejected = 0;
  for (const v of views) {
    for (const e of v.entries) {
      if (!inPeriod(e.entry_date, period)) continue;
      const counted = counts(e);
      if (counted) {
        good += Number(e.good_qty);
        rejected += Number(e.rejected_qty);
      }
      rows.push([
        e.entry_date,
        v.job.job_number ?? 'Not numbered yet',
        v.job.title,
        v.stages.find((s) => s.id === e.job_stage_id)?.name ?? '',
        e.employee_id ? (names.get(e.employee_id) ?? '') : '',
        Number(e.good_qty),
        Number(e.rejected_qty),
        v.job.unit,
        e.rejection_reason ?? '',
        e.recorded_by_name ?? '',
        e.voided_at ? `Voided: ${e.void_reason ?? ''}` : counted ? 'Counted' : 'Not recorded by server',
      ]);
    }
  }
  rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  return {
    title: 'Production',
    headers: ['Date', 'Job number', 'Job', 'Stage', 'Worker', 'Good', 'Rejected', 'Unit', 'Rejection reason', 'Recorded by', 'Status'],
    rows,
    totals: [
      { label: 'Good', value: good },
      { label: 'Rejected', value: rejected },
      { label: 'Rejection rate', value: `${Math.round(rejectionShare(good, rejected) * 1000) / 10}%` },
      { label: 'Entries', value: rows.length },
    ],
  };
}

// -----------------------------------------------------------------------------
/** Rejections grouped by stage name and reason, biggest first. */
export function rejectionReport(views: JobView[], period: Period): Report {
  const groups = new Map<string, { stage: string; reason: string; qty: number; entries: number; jobs: Set<string> }>();
  let total = 0;
  let made = 0;
  for (const v of views) {
    for (const e of v.entries) {
      if (!inPeriod(e.entry_date, period) || !counts(e)) continue;
      made += Number(e.good_qty) + Number(e.rejected_qty);
      if (Number(e.rejected_qty) <= 0) continue;
      const stage = v.stages.find((s) => s.id === e.job_stage_id)?.name ?? 'Stage';
      const reason = (e.rejection_reason ?? 'No reason').trim();
      const key = `${stage.toLowerCase()}|${reason.toLowerCase()}`;
      const g = groups.get(key) ?? { stage, reason, qty: 0, entries: 0, jobs: new Set<string>() };
      g.qty += Number(e.rejected_qty);
      g.entries += 1;
      g.jobs.add(v.job.id);
      groups.set(key, g);
      total += Number(e.rejected_qty);
    }
  }
  const sorted = [...groups.values()].sort((a, b) => b.qty - a.qty);
  return {
    title: 'Rejections',
    headers: ['Stage', 'Reason', 'Rejected', 'Share of rejections', 'Entries', 'Jobs'],
    rows: sorted.map((g) => [g.stage, g.reason, g.qty, total > 0 ? `${Math.round((g.qty / total) * 1000) / 10}%` : '0%', g.entries, g.jobs.size]),
    totals: [
      { label: 'Rejected', value: total },
      { label: 'Rejection rate', value: `${Math.round((made > 0 ? total / made : 0) * 1000) / 10}%` },
      { label: 'Top reason', value: sorted[0] ? `${sorted[0].reason} (${sorted[0].stage})` : '-' },
    ],
  };
}

// -----------------------------------------------------------------------------
/** Stock now, and what moved in the period, per material. */
export function stockReport(materials: MaterialView[], period: Period): Report {
  const rows: Cell[][] = [];
  let low = 0;
  for (const m of materials) {
    const moved = m.movements.filter((mv: StockMovementRecord) => inPeriod(mv.movement_date, period) && mv._sync !== 'rejected' && mv._sync !== 'conflict');
    const sum = (kind: StockMovementRecord['kind']) => moved.filter((mv) => mv.kind === kind).reduce((s, mv) => s + Number(mv.qty), 0);
    if (m.level !== 'ok' && m.material.is_active) low += 1;
    rows.push([
      m.material.name,
      m.material.code ?? '',
      m.material.category ?? '',
      m.material.unit,
      sum('receive'),
      -sum('issue'),
      sum('adjust'),
      m.onHand,
      Number(m.material.min_stock),
      { ok: 'OK', low: 'Low', out: 'Out of stock', negative: 'Below zero' }[m.level],
    ]);
  }
  return {
    title: 'Stock',
    headers: ['Material', 'Code', 'Category', 'Unit', 'Received', 'Issued', 'Adjusted', 'On hand now', 'Minimum', 'Level'],
    rows,
    totals: [
      { label: 'Materials', value: materials.length },
      { label: 'Need attention', value: low },
    ],
  };
}
