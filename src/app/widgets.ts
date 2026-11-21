import { registerPlugin } from '@capacitor/core';
import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isNativeApp } from './native';
import { useLocalData } from '../offline/LocalDataProvider';
import { useAuth } from '../auth/AuthProvider';
import { buildDemoJobs, DEMO_SESSION } from '../features/dashboard/demoData';
import { computeJobMetrics, type JobSummary } from '../domain/jobs';
import { toSummary, useJobViews } from '../features/jobs/jobData';
import { describeSync, type SyncState } from './layout/SyncIndicator';

/**
 * What the Android home-screen widgets show. Counts and labels only: no
 * customer names or other business details leave the app's own storage.
 */
export interface WidgetSnapshot {
  business: string;
  demo: boolean;
  inProduction: number;
  delayed: number;
  customers: number;
  waitingSync: number;
  syncLabel: string;
  syncTone: 'good' | 'wait' | 'bad' | 'none';
  updatedLabel: string;
}

interface WidgetBridgePlugin {
  update(options: { snapshot: WidgetSnapshot }): Promise<void>;
  clear(): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');

function toneOf(state: SyncState): WidgetSnapshot['syncTone'] {
  switch (state.kind) {
    case 'connected':
      return 'good';
    case 'pending':
    case 'offline':
    case 'syncing':
      return 'wait';
    case 'failed':
    case 'conflict':
      return 'bad';
    default:
      return 'none';
  }
}

function waitingOf(state: SyncState): number {
  return 'pending' in state ? state.pending : 0;
}

export function buildWidgetSnapshot(input: {
  business: string;
  demo: boolean;
  customers: number;
  sync: SyncState;
  /** The business's own jobs. When there are none, sample figures are shown and marked as demo. */
  jobs?: JobSummary[];
  now?: Date;
}): WidgetSnapshot {
  const now = input.now ?? new Date();
  // Samples only for the unconnected demo before any job exists; a real business always sees its own numbers.
  const useSamples = input.demo && !(input.jobs && input.jobs.length > 0);
  const metrics = computeJobMetrics(useSamples ? buildDemoJobs(now) : (input.jobs ?? []), now);
  return {
    business: input.business,
    demo: useSamples,
    inProduction: metrics.inProduction,
    delayed: metrics.delayed,
    customers: input.customers,
    waitingSync: waitingOf(input.sync),
    syncLabel: input.sync.kind === 'not_connected' ? '' : describeSync(input.sync, now).label,
    syncTone: toneOf(input.sync),
    updatedLabel: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(now),
  };
}

/** Keeps the home-screen widgets up to date while the Android app is open. */
export function useHomeScreenWidgets(): void {
  const { db, syncState } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  const customers = useLiveQuery(async () => (await db.customers.toArray()).filter((c) => !c.deleted_at).length, [db]);
  const native = useMemo(() => isNativeApp(), []);
  const views = useJobViews(db);

  useEffect(() => {
    if (!native || customers === undefined || views === undefined) return;
    const snapshot = buildWidgetSnapshot({
      business: status === 'demo' ? DEMO_SESSION.businessName : (activeWorkspace?.name ?? 'JobFlow'),
      // Demo mode is always marked; a signed-in business is marked only while it has no jobs yet.
      demo: status === 'demo',
      customers,
      jobs: views.map(toSummary),
      sync: syncState,
    });
    const timer = window.setTimeout(() => {
      WidgetBridge.update({ snapshot }).catch(() => {
        // Older app builds without the widget plugin: nothing to update.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [native, customers, views, syncState, status, activeWorkspace]);
}

/** Forget widget figures (on sign-out), so the next person does not see them. */
export function clearHomeScreenWidgets(): void {
  if (isNativeApp()) WidgetBridge.clear().catch(() => undefined);
}
