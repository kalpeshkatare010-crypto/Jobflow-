import type { ProductionEntryRecord } from '../offline/db';
import { counts } from '../offline/production';

export interface WeekOutput {
  week: string;
  good: number;
  rejected: number;
}

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Finished good output (stages that count as output) and rejections (all
 * stages) in rolling 7-day windows ending today, oldest first.
 */
export function weeklyOutput(
  entries: Pick<ProductionEntryRecord, 'entry_date' | 'good_qty' | 'rejected_qty' | 'voided_at' | '_sync' | 'job_stage_id'>[],
  outputStageIds: ReadonlySet<string>,
  today: Date,
  weeks = 8,
): WeekOutput[] {
  const label = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
  const result: WeekOutput[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7 * i);
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
    const from = iso(start);
    const to = iso(end);
    let good = 0;
    let rejected = 0;
    for (const e of entries) {
      if (!counts(e) || e.entry_date < from || e.entry_date > to) continue;
      if (outputStageIds.has(e.job_stage_id)) good += Number(e.good_qty);
      rejected += Number(e.rejected_qty);
    }
    result.push({ week: label.format(start), good, rejected });
  }
  return result;
}

/** Rejected share of everything made, 0..1. */
export function rejectionShare(good: number, rejected: number): number {
  const total = good + rejected;
  return total > 0 ? rejected / total : 0;
}

export function todayIso(now = new Date()): string {
  return iso(now);
}
