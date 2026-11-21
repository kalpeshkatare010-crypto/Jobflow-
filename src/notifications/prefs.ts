import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_PREFS, type NotificationPrefs } from './planner';

const KEY = 'jobflow:notifications';
const listeners = new Set<() => void>();
let cached: NotificationPrefs | null = null;

function read(): NotificationPrefs {
  if (cached) return cached;
  try {
    cached = { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<NotificationPrefs>) };
  } catch {
    cached = DEFAULT_PREFS;
  }
  return cached;
}

export function getNotificationPrefs(): NotificationPrefs {
  return read();
}

export function setNotificationPrefs(next: NotificationPrefs): void {
  cached = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the choice lasts until the app closes.
  }
  listeners.forEach((l) => l());
}

/** Reminder choices for this device (each phone decides for itself). */
export function useNotificationPrefs(): [NotificationPrefs, (patch: Partial<NotificationPrefs>) => void] {
  const prefs = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    read,
  );
  const update = useCallback((patch: Partial<NotificationPrefs>) => setNotificationPrefs({ ...read(), ...patch }), []);
  return [prefs, update];
}

// Small per-device memory so facts do not repeat and low-stock alerts are not resent.
const MEMO = 'jobflow:notification-memory';
interface Memory {
  factsShown: string[];
  lowStockKey: string | null;
  lowStockSentAt: number | null;
}

export function readMemory(): Memory {
  try {
    return { factsShown: [], lowStockKey: null, lowStockSentAt: null, ...(JSON.parse(localStorage.getItem(MEMO) ?? '{}') as Partial<Memory>) };
  } catch {
    return { factsShown: [], lowStockKey: null, lowStockSentAt: null };
  }
}

export function writeMemory(memory: Memory): void {
  try {
    localStorage.setItem(MEMO, JSON.stringify(memory));
  } catch {
    // Not critical.
  }
}
