import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { canUseNow, formatRupees, PLAN, PLANS, subscriptionNotice } from '../../src/domain/plans';
import { createFakeBackend, workspace } from './fakeAuthBackend';

const DAY = 86_400_000;

describe('plans', () => {
  it('has one plan, ₹999 a month with no limits, matching the database', () => {
    const sql = readFileSync('supabase/migrations/20261121000800_single_plan_and_admin.sql', 'utf8');
    const row = /\('standard', '([^']+)', (\d+), '([^']+)'/.exec(sql);
    expect(row).not.toBeNull();
    expect(row![1]).toBe(PLAN.name);
    expect(Number(row![2])).toBe(PLAN.pricePaise);
    expect(Object.values(JSON.parse(row![3]!) as Record<string, unknown>).every((v) => v === null)).toBe(true);
    expect(PLANS).toHaveLength(1);
    expect(formatRupees(PLAN.pricePaise)).toBe('₹999');
  });

  it('ends access when the trial ends, and gives paid months 3 extra days, like the server', () => {
    const now = new Date('2026-11-21T10:00:00Z');
    const at = (days: number) => new Date(now.getTime() + days * DAY);
    expect(subscriptionNotice({ subscriptionStatus: 'trialing', trialEndsAt: at(10) }, now)).toMatchObject({ kind: 'trial', daysLeft: 10 });
    expect(subscriptionNotice({ subscriptionStatus: 'trialing', trialEndsAt: at(2) }, now)).toMatchObject({ kind: 'trial_ending', daysLeft: 2 });
    expect(subscriptionNotice({ subscriptionStatus: 'trialing', trialEndsAt: at(-0.01) }, now).kind).toBe('ended');
    expect(canUseNow({ subscriptionStatus: 'active', trialEndsAt: null, periodEnd: at(-2) }, now)).toBe(true);
    expect(canUseNow({ subscriptionStatus: 'active', trialEndsAt: null, periodEnd: at(-4) }, now)).toBe(false);
    expect(subscriptionNotice({ subscriptionStatus: 'past_due', trialEndsAt: null, periodEnd: at(-1) }, now).kind).toBe('payment_due');
    expect(subscriptionNotice({ subscriptionStatus: 'expired', trialEndsAt: at(-80) }, now).kind).toBe('ended');
    expect(canUseNow({ subscriptionStatus: 'trialing', trialEndsAt: at(-30), complimentary: true }, now)).toBe(true);
  });
});

function renderApp(backend: ReturnType<typeof createFakeBackend>['backend'] | null, path: string) {
  return render(
    <AuthProvider backend={backend}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const user = { id: 'user-1', email: 'a@alpha.test', fullName: 'Asha' };

describe('Subscription in the app', () => {
  it('shows the single ₹999 plan in demo mode, and says online payment is not switched on', async () => {
    renderApp(null, '/settings');
    expect(await screen.findByText('₹999')).toBeInTheDocument();
    expect(screen.getByText(/Online payment is not switched on yet/)).toBeInTheDocument();
  });

  it('lets a business in its trial use the app, with a quiet days-left line and no banner', async () => {
    const { backend } = createFakeBackend({ user, workspaces: [workspace('Alpha Fabricators', 't1')] });
    renderApp(backend, '/jobs');
    expect((await screen.findAllByText(/Free trial: 10 days left/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Your free trial has ended/)).not.toBeInTheDocument();
  });

  it('shows one hideable line in the last 3 days, telling non-owners to ask the owner', async () => {
    const ending = { ...workspace('Alpha Fabricators', 't1'), trialEndsAt: new Date(Date.now() + 2 * DAY), role: 'employee' as const };
    const { backend } = createFakeBackend({ user, workspaces: [ending] });
    renderApp(backend, '/jobs');
    expect(await screen.findByText(/Your free trial ends in 2 days/)).toBeInTheDocument();
    expect(screen.getByText(/Please tell the business owner/)).toBeInTheDocument();
  });

  it('shows the subscribe screen once the trial has ended, but keeps Help open', async () => {
    const ended = { ...workspace('Alpha Fabricators', 't1'), trialEndsAt: new Date(Date.now() - DAY) };
    const { backend } = createFakeBackend({ user, workspaces: [ended] });
    renderApp(backend, '/jobs');
    expect(await screen.findByText('Your free trial has ended')).toBeInTheDocument();
    expect(screen.getByText('₹999')).toBeInTheDocument();
    expect(screen.getByText(/nothing is deleted/)).toBeInTheDocument();
  });

  it('tells an employee to ask the owner instead of showing a price', async () => {
    const ended = { ...workspace('Alpha Fabricators', 't1'), trialEndsAt: new Date(Date.now() - DAY), role: 'employee' as const };
    const { backend } = createFakeBackend({ user, workspaces: [ended] });
    renderApp(backend, '/jobs');
    expect(await screen.findByText(/Ask the owner of Alpha Fabricators to subscribe/)).toBeInTheDocument();
    expect(screen.queryByText('₹999')).not.toBeInTheDocument();
  });

  it('lets the JobFlow owner in for free and never shows him a price or trial reminder', async () => {
    const ended = { ...workspace('RK Digitals', 't1'), trialEndsAt: new Date(Date.now() - DAY) };
    const { backend } = createFakeBackend({ user, workspaces: [ended], platformAdmin: true });
    renderApp(backend, '/settings');
    expect(await screen.findByText(/This is your own business/)).toBeInTheDocument();
    expect(screen.queryByText('₹999')).not.toBeInTheDocument();
    expect(screen.queryByText(/Your free trial has ended/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Free trial:/)).not.toBeInTheDocument();
  });
});
