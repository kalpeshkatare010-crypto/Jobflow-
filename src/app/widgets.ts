import { registerPlugin } from '@capacitor/core';
import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { isNativeApp } from './native';
import { useLocalData } from '../offline/LocalDataProvider';
import { useAuth } from '../auth/AuthProvider';
import { buildDemoJobs, DEMO_SESSION } from '../features/dashboard/demoData';
import { computeJobMetrics } from '../domain/jobs';
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
  now?: Date;
}): WidgetSnapshot {
  const now = input.now ?? new Date();
  // Jobs are sample data until job orders arrive (Milestone 5).
  const metrics = computeJobMetrics(buildDemoJobs(now), now);
  return {
    business: input.business,
    demo: input.demo,
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

  useEffect(() => {
    if (!native || customers === undefined) return;
    const snapshot = buildWidgetSnapshot({
      business: status === 'demo' ? DEMO_SESSION.businessName : (activeWorkspace?.name ?? 'JobFlow'),
      // Job figures are samples in every mode until job orders exist.
      demo: true,
      customers,
      sync: syncState,
    });
    const timer = window.setTimeout(() => {
      WidgetBridge.update({ snapshot }).catch(() => {
        // Older app builds without the widget plugin: nothing to update.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [native, customers, syncState, status, activeWorkspace]);
}

/** Forget widget figures (on sign-out), so the next person does not see them. */
export function clearHomeScreenWidgets(): void {
  if (isNativeApp()) WidgetBridge.clear().catch(() => undefined);
}
