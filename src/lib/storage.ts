/**
 * Safe wrappers for small UI preferences in localStorage.
 * Storage can be unavailable (private mode, blocked cookies), so every call
 * fails quietly and returns the fallback. Business data never goes here;
 * it lives in IndexedDB from Milestone 3.
 */
export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`jobflow:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePreference<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(`jobflow:${key}`, JSON.stringify(value));
  } catch {
    // Preference is simply not remembered.
  }
}
