import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Chrome/Edge event that lets the app show its own "Install" button. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * Install button support. `canInstall` is true when the browser offers
 * installation and the app is not already installed.
 */
export function useInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setEvent(null);
  }

  return { canInstall: event !== null && !installed, installed, install };
}

const STARTED_AT = Date.now();
/** Within this long after opening, nobody has started typing yet, so updating right away is safe. */
const FRESH_START_MS = 15_000;

/**
 * Keeps the website on the newest version without interrupting work:
 * - checks for a new version on open, whenever the app comes back to the screen, and every 30 minutes;
 * - applies it at once if the app was just opened, otherwise the moment the person leaves the app
 *   (their saved work is in the device database, so nothing is lost);
 * - meanwhile shows the "new version" notice for anyone who wants it now.
 */
export function useAppUpdate() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine !== false) void registration.update().catch(() => undefined);
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, 30 * 60_000);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    if (Date.now() - STARTED_AT < FRESH_START_MS || document.visibilityState === 'hidden') {
      void updateServiceWorker(true);
      return;
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') void updateServiceWorker(true);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [needRefresh, updateServiceWorker]);

  return {
    updateReady: needRefresh,
    applyUpdate: () => void updateServiceWorker(true),
    dismiss: () => setNeedRefresh(false),
  };
}
