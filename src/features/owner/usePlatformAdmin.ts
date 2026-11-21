import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';

/** Asks the server whether this account is on the JobFlow owner list. Only decides whether to show the menu item; the server checks again for the data. */
export function usePlatformAdmin(): boolean {
  const { backend, status, user } = useAuth();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!backend || status !== 'signed_in') {
      setAdmin(false);
      return;
    }
    let alive = true;
    backend
      .isPlatformAdmin()
      .then((value) => alive && setAdmin(value))
      .catch(() => alive && setAdmin(false));
    return () => {
      alive = false;
    };
  }, [backend, status, user?.id]);
  return admin;
}
