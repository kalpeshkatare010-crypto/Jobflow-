import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { formatRupees, PLANS, subscriptionNotice } from '../../src/domain/plans';
import { createFakeBackend, workspace } from './fakeAuthBackend';

const DAY = 86_400_000;

describe('plans', () => {
  it('match the database exactly: Starter ₹299 and Professional ₹599 with the same limits', () => {
    const sql = readFileSync('supabase/migrations/20261120000100_tenancy.sql', 'utf8');
    for (const plan of PLANS) {
      const row = new RegExp(`\\('${plan.code}', '${plan.name}', (\\d+), '([^']+)'`).exec(sql);
      expect(row, plan.code).not.toBeNull();
      expect(Number(row![1])).toBe(plan.pricePaise);
      const limits = JSON.parse(row![2]!) as Record<string, number | null>;
      expect(limits).toEqual({ logins: plan.limits.logins, employees: plan.limits.employees, workflows: plan.limits.workflows, open_jobs: plan.limits.openJobs });
    }
    expect(PLANS.map((p) => formatRupees(p.pricePaise))).toEqual(['₹299', '₹599']);
  });

  it('describe the trial, the grace week and read-only like the server does', () => {
    const now = new Date('2026-11-21T10:00:00Z');
    const at = (days: number) => new Date(now.getTime() + days * DAY);
    expect(subscriptionNotice({ subscriptionStatus: 'trialing', trialEndsAt: at(10) }, now)).toMatchObject({ kind: 'trial', daysLeft: 10 });
    expect(subscriptionNotice({ subscriptionStatus: 'trialing', trialEndsAt: at(2) }, now)).toMatchObject({ kind: 'trial_ending', daysLeft: 2 });
    expect(subscriptionNotice({ subscriptionStatus: 'trialing', trialEndsAt: at(-3) }, now).kind).toBe('grace');
    expect(subscriptionNotice({ subscriptionStatus: 'trialing', trialEndsAt: at(-8) }, now).kind).toBe('read_only');
    expect(subscriptionNotice({ subscriptionStatus: 'active', trialEndsAt: at(-80) }, now).kind).toBe('none');
    expect(subscriptionNotice({ subscriptionStatus: 'past_due', trialEndsAt: at(-80) }, now).kind).toBe('payment_due');
    expect(subscriptionNotice({ subscriptionStatus: 'expired', trialEndsAt: at(-80) }, now).kind).toBe('read_only');
  });
});

describe('Plan and billing screen', () => {
  it('shows both plans with prices in demo mode, and says payments are not switched on', async () => {
    render(
      <AuthProvider backend={null}>
        <MemoryRouter initialEntries={['/settings']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('₹299')).toBeInTheDocument();
    expect(screen.getByText('₹599')).toBeInTheDocument();
    expect(screen.getByText(/Online payment is not switched on yet/)).toBeInTheDocument();
  });

  it('warns everyone when the trial is about to end, and tells non-owners to ask the owner', async () => {
    const ending = { ...workspace('Alpha Fabricators', 't1'), trialEndsAt: new Date(Date.now() + 2 * DAY), role: 'employee' as const };
    const { backend } = createFakeBackend({ user: { id: 'user-1', email: 'a@alpha.test', fullName: 'Asha' }, workspaces: [ending] });
    render(
      <AuthProvider backend={backend}>
        <MemoryRouter initialEntries={['/jobs']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText(/The free trial ends in 2 days/)).toBeInTheDocument();
    expect(screen.getByText(/Please tell the business owner/)).toBeInTheDocument();
  });
});
