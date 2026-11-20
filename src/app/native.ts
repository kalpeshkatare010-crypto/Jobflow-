import { Capacitor } from '@capacitor/core';

/** True inside the Android app (Capacitor), false in a browser or installed web app. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Android app behaviour. The phone's Back button goes back a screen, and
 * leaves the app only from the first screen. Loaded only inside the app.
 */
export async function setUpNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}
