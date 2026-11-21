import { describe, expect, it } from 'vitest';
import { planNotifications, DEFAULT_PREFS, type PlannerInput } from '../../src/notifications/planner';
import { FACTS, nextFacts } from '../../src/notifications/facts';
import { latestSignedBuild } from '../../src/app/updates';
import type { JobSummary } from '../../src/domain/jobs';

// Monday 21 Dec 2026, 8:30 in the morning (local time)
const MONDAY = new Date(2026, 11, 21, 8, 30);

function job(over: Partial<JobSummary>): JobSummary {
  return {
    id: 'j', jobNumber: 'JOB-0001', title: 'Cartons', customerName: 'Godavari Foods', status: 'in_production',
    quantity: 100, unit: 'pcs', producedQty: 0, rejectedQty: 0, dueDate: new Date(2026, 11, 30), priority: 'normal',
    stages: [{ name: 'Printing', state: 'done' }, { name: 'Packing', state: 'current' }], ...over,
  };
}

function input(over: Partial<PlannerInput> = {}): PlannerInput {
  return {
    now: MONDAY, prefs: { ...DEFAULT_PREFS, enabled: true }, jobs: [job({})], entriesToday: 0, lowStock: [],
    lowStockAlreadySent: false, trialDaysLeft: null, isOwner: true, factsShown: [], ...over,
  };
}

describe('reminder planner', () => {
  it('sends nothing until switched on', () => {
    expect(planNotifications(input({ prefs: DEFAULT_PREFS }))).toEqual([]);
  });

  it('plans a true morning summary, the evening production nudge and a 3-day idle nudge', () => {
    const plan = planNotifications(input({ jobs: [job({}), job({ id: 'late', dueDate: new Date(2026, 11, 19) })] }));
    const summary = plan.find((n) => n.kind === 'summary')!;
    expect(summary.at).toEqual(new Date(2026, 11, 21, 9, 0));
    expect(summary.title).toBe('Good morning. 1 job overdue');
    expect(summary.body).toContain('2 jobs in production');
    expect(plan.find((n) => n.kind === 'production')!.at).toEqual(new Date(2026, 11, 21, 18, 0));
    expect(plan.find((n) => n.kind === 'idle')!.at).toEqual(new Date(2026, 11, 24, 11, 0));
  });

  it('skips the production nudge once something was recorded today', () => {
    expect(planNotifications(input({ entriesToday: 2 })).some((n) => n.kind === 'production')).toBe(false);
  });

  it('reminds the day before a job is due', () => {
    const plan = planNotifications(input({ jobs: [job({ jobNumber: 'JOB-0149', dueDate: new Date(2026, 11, 23) })] }));
    const due = plan.find((n) => n.kind === 'due')!;
    expect(due.title).toBe('Due tomorrow: JOB-0149');
    expect(due.at).toEqual(new Date(2026, 11, 22, 9, 15));
  });

  it('sends low stock once per change', () => {
    const low = [{ name: 'Art paper', onHand: 300, minimum: 500, unit: 'sheets' }];
    expect(planNotifications(input({ lowStock: low })).find((n) => n.kind === 'low_stock')!.body).toBe('300 of 500 sheets left. Time to reorder?');
    expect(planNotifications(input({ lowStock: low, lowStockAlreadySent: true })).some((n) => n.kind === 'low_stock')).toBe(false);
  });

  it('warns only owners about the trial', () => {
    expect(planNotifications(input({ trialDaysLeft: 2 })).some((n) => n.kind === 'trial')).toBe(true);
    expect(planNotifications(input({ trialDaysLeft: 2, isOwner: false })).some((n) => n.kind === 'trial')).toBe(false);
  });

  it('schedules facts on Monday, Wednesday and Friday at 13:00, without repeats', () => {
    const facts = planNotifications(input()).filter((n) => n.kind === 'fact');
    expect(facts).toHaveLength(6);
    expect(facts.every((f) => [1, 3, 5].includes(f.at.getDay()) && f.at.getHours() === 13)).toBe(true);
    expect(new Set(facts.map((f) => f.factId)).size).toBe(6);
  });

  it('never notifies at night and never in the past', () => {
    const late = planNotifications(input({ now: new Date(2026, 11, 21, 22, 30) }));
    expect(late.every((n) => n.at.getHours() >= 8 && n.at.getHours() < 21 && n.at > new Date(2026, 11, 21, 22, 30))).toBe(true);
  });

  it('cycles through every fact before repeating', () => {
    const shown = FACTS.slice(0, FACTS.length - 1).map((f) => f.id);
    expect(nextFacts(shown, 2).map((f) => f.id)).toEqual([FACTS[FACTS.length - 1]!.id, FACTS[0]!.id]);
    expect(new Set(FACTS.map((f) => f.id)).size).toBe(FACTS.length);
  });
});

describe('in-app updates', () => {
  it('picks the newest signed build and ignores TEST builds and other files', () => {
    const asset = (name: string) => ({ name, browser_download_url: `https://x/${name}`, size: 4_000_000 });
    expect(
      latestSignedBuild([asset('JobFlow-0.1.0-build24.apk'), asset('JobFlow-0.1.0-build26-TEST.apk'), asset('JobFlow-0.1.0-build25.apk'), asset('notes.txt')]),
    ).toMatchObject({ build: 25, name: 'JobFlow-0.1.0-build25.apk' });
    expect(latestSignedBuild([])).toBeNull();
  });
});
