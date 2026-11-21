/**
 * Google sign-in shows only when it has been switched on in Supabase and the
 * build says so (VITE_GOOGLE_SIGN_IN=true). This avoids a button that fails.
 */
export function googleSignInEnabled(): boolean {
  return import.meta.env.VITE_GOOGLE_SIGN_IN === 'true';
}

const NEXT_KEY = 'jobflow:auth-next';

/** Remembers where to go after a sign-in that leaves the page (Google). */
export function rememberNext(next: string) {
  try {
    sessionStorage.setItem(NEXT_KEY, next);
  } catch {
    // Storage can be unavailable (private mode); the user then lands on the dashboard.
  }
}

export function takeRememberedNext(): string | null {
  try {
    const value = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return value;
  } catch {
    return null;
  }
}
