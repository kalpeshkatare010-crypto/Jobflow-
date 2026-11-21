import type { JobSummary } from '../domain/jobs';
import { nextFacts } from './facts';

/** Which reminders the person wants. Stored per device. */
export interface NotificationPrefs {
  enabled: boolean;
  summary: boolean;
  dueDates: boolean;
  production: boolean;
  lowStock: boolean;
  facts: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  summary: true,
  dueDates: true,
  production: true,
  lowStock: true,
  facts: true,
};

export interface PlannerInput {
  now: Date;
  prefs: NotificationPrefs;
  jobs: JobSummary[];
  /** Production entries recorded today (any job). */
  entriesToday: number;
  lowStock: { name: string; onHand: number; minimum: number; unit: string }[];
  /** Low-stock alert already sent for this exact set in the last 3 days. */
  lowStockAlreadySent: boolean;
  trialDaysLeft: number | null;
  isOwner: boolean;
  factsShown: string[];
}

export interface PlannedNotification {
  id: number;
  kind: 'summary' | 'due' | 'production' | 'low_stock' | 'trial' | 'fact' | 'idle';
  title: string;
  body: string;
  at: Date;
  path: string;
  factId?: string;
}

/** Notifications only between these hours: never at night. */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;

const OPEN = new Set(['draft', 'approved', 'in_production', 'on_hold']);

function at(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, hour, minute, 0, 0);
}

/** Today at that time if still ahead (with a minute's margin), otherwise tomorrow. */
function nextAt(now: Date, hour: number, minute = 0): Date {
  const today = at(now, 0, hour, minute);
  return today.getTime() - now.getTime() > 60_000 ? today : at(now, 1, hour, minute);
}

function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Works out the reminders to schedule from what this device knows now. It is
 * re-run whenever the app opens, comes back, or data changes, so reminders
 * stay true; someone who stops opening the app gets at most one nudge.
 */
export function planNotifications(input: PlannerInput): PlannedNotification[] {
  const { now, prefs } = input;
  if (!prefs.enabled) return [];
  const out: PlannedNotification[] = [];
  const open = input.jobs.filter((j) => OPEN.has(j.status));
  const inProduction = open.filter((j) => j.status === 'in_production');
  const overdue = open.filter((j) => j.dueDate && dayDiff(now, j.dueDate) < 0);
  const dueToday = open.filter((j) => j.dueDate && dayDiff(now, j.dueDate) === 0);

  // 1. Morning summary, 9:00. Only when there is something to say.
  if (prefs.summary && open.length > 0) {
    const morning = nextAt(now, 9);
    const parts = [
      inProduction.length ? `${plural(inProduction.length, 'job')} in production` : null,
      dueToday.length ? `${dueToday.length} due today` : null,
      overdue.length ? `${overdue.length} overdue` : null,
    ].filter(Boolean);
    out.push({
      id: 100,
      kind: 'summary',
      title: overdue.length ? `Good morning. ${plural(overdue.length, 'job')} overdue` : 'Good morning',
      body: parts.length ? `${parts.join(', ')}. Tap to see the floor.` : `${plural(open.length, 'open job')}. Tap to see the floor.`,
      at: morning,
      path: '/',
    });
  }

  // 2. Due dates: the day before, at 9:15, for the next 3 days (at most 3 reminders).
  if (prefs.dueDates) {
    const soon = open
      .filter((j) => j.dueDate && dayDiff(now, j.dueDate) >= 1 && dayDiff(now, j.dueDate) <= 3)
      .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
      .slice(0, 3);
    soon.forEach((job, i) => {
      const when = at(job.dueDate!, -1, 9, 15);
      if (when <= now) return;
      out.push({
        id: 200 + i,
        kind: 'due',
        title: `Due tomorrow: ${job.jobNumber}`,
        body: `${job.title} for ${job.customerName}. ${job.stages.filter((s) => s.state === 'done').length} of ${job.stages.length} stages done.`,
        at: when,
        path: `/jobs`,
      });
    });
  }

  // 3. Production reminder, 18:00, when jobs are on the floor and nothing was recorded today.
  if (prefs.production && inProduction.length > 0 && input.entriesToday === 0) {
    const evening = at(now, 0, 18);
    if (evening.getTime() - now.getTime() > 60_000 && now.getDay() !== 0) {
      out.push({
        id: 300,
        kind: 'production',
        title: "Record today's output",
        body: `${plural(inProduction.length, 'job')} in production and nothing recorded yet today. It takes a minute.`,
        at: evening,
        path: '/production?new=1',
      });
    }
  }

  // 4. Low stock, once per change, 10:00.
  if (prefs.lowStock && input.lowStock.length > 0 && !input.lowStockAlreadySent) {
    const first = input.lowStock[0]!;
    out.push({
      id: 400,
      kind: 'low_stock',
      title: input.lowStock.length === 1 ? `Low stock: ${first.name}` : `${input.lowStock.length} materials are low`,
      body:
        input.lowStock.length === 1
          ? `${first.onHand} of ${first.minimum} ${first.unit} left. Time to reorder?`
          : `${first.name} and ${plural(input.lowStock.length - 1, 'other')} are below their minimum.`,
      at: nextAt(now, 10),
      path: '/inventory',
    });
  }

  // 5. Trial ending: owners only, 3 days or less.
  if (input.isOwner && input.trialDaysLeft !== null && input.trialDaysLeft >= 0 && input.trialDaysLeft <= 3) {
    out.push({
      id: 500,
      kind: 'trial',
      title: input.trialDaysLeft === 0 ? 'Your free trial ends today' : `Your free trial ends in ${plural(input.trialDaysLeft, 'day')}`,
      body: 'Choose a plan to keep making changes. Nothing is deleted either way.',
      at: nextAt(now, 11),
      path: '/settings#plan',
    });
  }

  // 6. Shop-floor facts: Monday, Wednesday and Friday at 13:00, for the next two weeks.
  if (prefs.facts) {
    const slots: Date[] = [];
    for (let d = 0; d < 14 && slots.length < 6; d += 1) {
      const day = at(now, d, 13);
      if ([1, 3, 5].includes(day.getDay()) && day.getTime() - now.getTime() > 60_000) slots.push(day);
    }
    nextFacts(input.factsShown, slots.length).forEach((fact, i) => {
      out.push({ id: 600 + i, kind: 'fact', title: `Did you know? ${fact.title}`, body: fact.body, at: slots[i]!, path: fact.path, factId: fact.id });
    });
  }

  // 7. One gentle nudge if the app is not opened for 3 days (replaced each time it is opened).
  if (open.length > 0 && (prefs.summary || prefs.dueDates)) {
    out.push({
      id: 700,
      kind: 'idle',
      title: 'Your shop floor is waiting',
      body: `${plural(open.length, 'open job')} in JobFlow. Open it to catch up in a minute.`,
      at: at(now, 3, 11),
      path: '/',
    });
  }

  // Never at night, never in the past.
  return out.filter((n) => n.at.getHours() >= QUIET_END_HOUR && n.at.getHours() < QUIET_START_HOUR && n.at > now);
}
