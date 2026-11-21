/**
 * Controls the launch animation that lives in index.html (#boot-splash), so it
 * runs from the very first paint, before any script loads.
 */
const MIN_FIRST_SHOW_MS = 1200;
const RESUME_SHOW_MS = 950;
/** Coming back after at least this long away replays the animation. */
export const RESUME_AFTER_MS = 30_000;

function el(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('boot-splash');
}

function hide(splash: HTMLElement) {
  splash.classList.add('bs-leave');
  window.setTimeout(() => splash.classList.add('bs-hidden'), 300);
}

let firstHidden = false;

/** Fades the launch animation out once the app is ready, after it has played at least once. */
export function hideLaunchSplash(): void {
  const splash = el();
  if (!splash || firstHidden) return;
  firstHidden = true;
  const elapsed = typeof performance !== 'undefined' ? performance.now() : MIN_FIRST_SHOW_MS;
  window.setTimeout(() => hide(splash), Math.max(0, MIN_FIRST_SHOW_MS - elapsed));
}

/** Replays the animation briefly, for coming back to the app after a while. */
export function replaySplash(): void {
  const splash = el();
  if (!splash || !firstHidden) return;
  // A fresh copy restarts every CSS animation from the beginning.
  const fresh = splash.cloneNode(true) as HTMLElement;
  fresh.classList.remove('bs-leave', 'bs-hidden');
  splash.replaceWith(fresh);
  window.setTimeout(() => hide(fresh), RESUME_SHOW_MS);
}
