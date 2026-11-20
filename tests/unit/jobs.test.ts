import { describe, expect, it } from 'vitest';
import {
  computeJobMetrics,
  countByStatus,
  isDelayed,
  progress,
  rejectionRate,
  upcomingDeadlines,
  type JobSummary,
} from '../../src/domain/jobs';

const today = new Date(2026, 10, 20, 10, 0);

function job(overrides: Partial<JobSummary>): JobSummary {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    jobNumber: 'JOB-0001',
    title: 'Test job',
    customerName: 'Test customer',
    status: 'in_production',
    quantity: 100,
    unit: 'pcs',
    producedQty: 0,
    rejectedQty: 0,
    dueDate: new Date(2026, 10, 25),
    priority: 'normal',
    stages: [],
    ...overrides,
  };
}

describe('isDelayed', () => {
  it('is delayed only when past due and still open', () => {
    expect(isDelayed(job({ dueDate: new Date(2026, 10, 19) }), today)).toBe(true);
    expect(isDelayed(job({ dueDate: new Date(2026, 10, 20) }), today)).toBe(false);
    expect(isDelayed(job({ dueDate: new Date(2026, 10, 19), status: 'completed' }), today)).toBe(false);
    expect(isDelayed(job({ dueDate: new Date(2026, 10, 19), status: 'cancelled' }), today)).toBe(false);
    expect(isDelayed(job({ dueDate: new Date(2026, 10, 19), status: 'on_hold' }), today)).toBe(true);
  });
});

describe('progress and rejection', () => {
  it('caps progress between 0 and 100%', () => {
    expect(progress(job({ producedQty: 50 }))).toBe(0.5);
    expect(progress(job({ producedQty: 130 }))).toBe(1);
    expect(progress(job({ quantity: 0 }))).toBe(0);
  });
  it('computes rejection share of everything produced', () => {
    expect(rejectionRate(95, 5)).toBe(0.05);
    expect(rejectionRate(0, 0)).toBe(0);
  });
});

describe('computeJobMetrics', () => {
  it('counts each dashboard figure from job records', () => {
    const jobs = [
      job({ status: 'draft' }),
      job({ status: 'approved' }),
      job({ status: 'on_hold', dueDate: new Date(2026, 10, 10) }),
      job({ status: 'in_production', dueDate: new Date(2026, 10, 18) }),
      job({ status: 'in_production' }),
      job({ status: 'completed', dueDate: new Date(2026, 10, 1) }),
      job({ status: 'delivered' }),
      job({ status: 'cancelled', dueDate: new Date(2026, 10, 1) }),
    ];
    expect(computeJobMetrics(jobs, today)).toEqual({
      total: 7,
      pending: 3,
      inProduction: 2,
      completed: 2,
      delayed: 2,
    });
  });

  it('returns zeros for a new business with no jobs', () => {
    expect(computeJobMetrics([], today)).toEqual({ total: 0, pending: 0, inProduction: 0, completed: 0, delayed: 0 });
  });
});

describe('countByStatus', () => {
  it('lists every status in lifecycle order', () => {
    const counts = countByStatus([job({ status: 'completed' }), job({ status: 'draft' }), job({ status: 'draft' })]);
    expect(counts.map((row) => row.status)).toEqual([
      'draft',
      'approved',
      'in_production',
      'on_hold',
      'completed',
      'delivered',
      'cancelled',
    ]);
    expect(counts.find((row) => row.status === 'draft')?.count).toBe(2);
  });
});

describe('upcomingDeadlines', () => {
  it('includes overdue and soon-due open jobs, soonest first, excluding drafts and closed jobs', () => {
    const late = job({ id: 'late', dueDate: new Date(2026, 10, 18) });
    const soon = job({ id: 'soon', dueDate: new Date(2026, 10, 22) });
    const far = job({ id: 'far', dueDate: new Date(2026, 11, 30) });
    const draft = job({ id: 'draft', status: 'draft', dueDate: new Date(2026, 10, 21) });
    const done = job({ id: 'done', status: 'completed', dueDate: new Date(2026, 10, 21) });
    expect(upcomingDeadlines([far, soon, done, draft, late], today).map((j) => j.id)).toEqual(['late', 'soon']);
  });
});
