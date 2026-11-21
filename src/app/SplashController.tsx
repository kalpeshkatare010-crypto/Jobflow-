import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { hideLaunchSplash, replaySplash, RESUME_AFTER_MS } from './splash';

/** Hides the launch animation when sign-in is known, and replays it when the person returns after a while. */
export function SplashController() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') hideLaunchSplash();
  }, [status]);

  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt !== null) {
        if (Date.now() - hiddenAt >= RESUME_AFTER_MS) replaySplash();
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return null;
}
