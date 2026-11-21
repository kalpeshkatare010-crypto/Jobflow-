import { useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { goTo, isNativeApp } from '../app/native';
import { useAuth } from '../auth/AuthProvider';
import { useLocalData } from '../offline/LocalDataProvider';
import { toSummary, useJobViews } from '../features/jobs/jobData';
import { useMaterialViews } from '../features/inventory/InventoryPage';
import { useAccess } from '../features/billing/access';
import { todayIso } from '../domain/production';
import { planNotifications, type PlannedNotification } from './planner';
import { readMemory, useNotificationPrefs, writeMemory } from './prefs';

const LOW_STOCK_REPEAT_MS = 3 * 86_400_000;

/**
 * Keeps this phone's scheduled reminders in step with its data. Re-plans on
 * open, on return, and when data changes; everything is worked out on the
 * phone, nothing is sent to a server. Android app only.
 */
export function useReminders(): void {
  const native = useMemo(() => isNativeApp(), []);
  const { status, activeWorkspace } = useAuth();
  const { db } = useLocalData();
  const [prefs] = useNotificationPrefs();
  const views = useJobViews(db);
  const materials = useMaterialViews();
  const entriesToday = useLiveQuery(() => db.productionEntries.where('entry_date').equals(todayIso()).count(), [db]);
  const lastKey = useRef('');
  const { notice, complimentary } = useAccess();

  useEffect(() => {
    if (!native || status !== 'signed_in' || !activeWorkspace || !views || !materials || entriesToday === undefined) return;
    const now = new Date();
    const memory = readMemory();
    const low = materials
      .filter((m) => m.level !== 'ok' && m.material.is_active)
      .map((m) => ({ name: m.material.name, onHand: m.onHand, minimum: Number(m.material.min_stock), unit: m.material.unit }));
    const lowKey = low.map((m) => m.name).sort().join('|') || null;
    const plan = planNotifications({
      now,
      prefs,
      jobs: views.map(toSummary),
      entriesToday,
      lowStock: low,
      lowStockAlreadySent: lowKey !== null && memory.lowStockKey === lowKey && Date.now() - (memory.lowStockSentAt ?? 0) < LOW_STOCK_REPEAT_MS,
      trialDaysLeft: !complimentary && (notice.kind === 'trial' || notice.kind === 'trial_ending') ? notice.daysLeft : null,
      isOwner: activeWorkspace.role === 'owner',
      factsShown: memory.factsShown,
    });
    // Skip identical re-plans (data changes that do not change any reminder).
    const key = JSON.stringify(plan.map((n) => [n.id, n.title, n.body, n.at.getTime()]));
    if (key === lastKey.current) return;
    lastKey.current = key;
    void schedule(plan).then(() => {
      if (plan.some((n) => n.kind === 'low_stock')) writeMemory({ ...readMemory(), lowStockKey: lowKey, lowStockSentAt: Date.now() });
    });
  }, [native, status, activeWorkspace, views, materials, entriesToday, prefs, notice, complimentary]);

  // Tapping a notification opens its screen; a fact counts as seen once delivered or tapped.
  useEffect(() => {
    if (!native) return;
    let remove: (() => void) | undefined;
    void import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
      const tapped = await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        markFactSeen(notification.extra?.factId as string | undefined);
        const path = notification.extra?.path as string | undefined;
        if (path) goTo(path);
      });
      const shown = await LocalNotifications.addListener('localNotificationReceived', (n) => markFactSeen(n.extra?.factId as string | undefined));
      remove = () => {
        void tapped.remove();
        void shown.remove();
      };
    });
    return () => remove?.();
  }, [native]);
}

function markFactSeen(factId: string | undefined) {
  if (!factId) return;
  const memory = readMemory();
  if (!memory.factsShown.includes(factId)) writeMemory({ ...memory, factsShown: [...memory.factsShown, factId] });
}

/** Replaces every pending JobFlow reminder with the new plan. */
async function schedule(plan: PlannedNotification[]): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  if (plan.length === 0) return;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return;
  await LocalNotifications.schedule({
    notifications: plan.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      schedule: { at: n.at, allowWhileIdle: true },
      extra: { path: n.path, factId: n.factId ?? null },
      smallIcon: 'ic_stat_jobflow',
      iconColor: '#F2D24B',
    })),
  });
}

/** Asks Android for permission to show notifications. Returns whether it was granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}
