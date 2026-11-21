import { Capacitor } from '@capacitor/core';

/** True inside the Android app (Capacitor), false in a browser or installed web app. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Turns an app link into an app path:
 * - widget links: com.rkdigitals.jobflow://open/customers?new=1 becomes /customers?new=1
 * - sign-in returns: com.rkdigitals.jobflow://auth/callback?code=… becomes /auth/callback?code=…
 */
export function pathFromAppLink(url: string): string | null {
  const auth = /^com\.rkdigitals\.jobflow:\/\/auth\/callback([?#].*)?$/.exec(url.trim());
  if (auth) return `/auth/callback${auth[1] ?? ''}`;
  const match = /^com\.rkdigitals\.jobflow:\/\/open(\/[^#]*)?$/.exec(url.trim());
  if (!match) return null;
  const path = match[1] || '/';
  return path.startsWith('//') ? '/' : path;
}

/** Opens a screen from outside React (widgets, links, notifications). */
export function goTo(path: string) {
  window.history.pushState({}, '', path);
  // React Router listens for popstate and shows the new screen.
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Android app behaviour:
 * - the phone's Back button goes back a screen, and leaves the app only from the first screen
 * - links from the home-screen widgets open the right screen
 */
export async function setUpNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
  await App.addListener('appUrlOpen', ({ url }) => {
    const path = pathFromAppLink(url);
    if (!path) return;
    if (path.startsWith('/auth/callback')) {
      // Back from Google or an emailed link: close the browser sheet first.
      void import('@capacitor/browser').then(({ Browser }) => Browser.close()).catch(() => undefined);
    }
    goTo(path);
  });
  const launch = await App.getLaunchUrl();
  const path = launch?.url ? pathFromAppLink(launch.url) : null;
  if (path && path !== '/') goTo(path);
}
