import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readPreference, writePreference } from '../lib/storage';
import type { AuthBackend, AuthUser, Workspace } from './types';

/**
 * demo       - the app is not connected to Supabase; sample data only
 * loading    - checking the saved session
 * signed_out - no session
 * signed_in  - session present; workspaces loaded
 */
export type AuthStatus = 'demo' | 'loading' | 'signed_out' | 'signed_in';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  /** Error loading workspaces (network, server). */
  loadError: string | null;
  backend: AuthBackend | null;
  selectWorkspace: (tenantId: string) => void;
  refreshWorkspaces: () => Promise<Workspace[]>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACTIVE_KEY = 'activeTenant';

export function AuthProvider({ backend, children }: { backend: AuthBackend | null; children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(backend ? 'loading' : 'demo');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => readPreference<string | null>(ACTIVE_KEY, null));
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    if (!backend) return [];
    try {
      const list = await backend.listWorkspaces();
      setWorkspaces(list);
      setLoadError(null);
      return list;
    } catch {
      setLoadError('Your businesses could not be loaded. Check your connection and try again.');
      return [];
    }
  }, [backend]);

  const applyUser = useCallback(
    async (next: AuthUser | null) => {
      setUser(next);
      if (!next) {
        setWorkspaces([]);
        setStatus('signed_out');
        return;
      }
      await refreshWorkspaces();
      setStatus('signed_in');
    },
    [refreshWorkspaces],
  );

  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    backend
      .getUser()
      .then((current) => {
        if (!cancelled) void applyUser(current);
      })
      .catch(() => {
        if (!cancelled) void applyUser(null);
      });
    const unsubscribe = backend.onChange((next) => {
      if (!cancelled) void applyUser(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [backend, applyUser]);

  const selectWorkspace = useCallback((tenantId: string) => {
    setActiveId(tenantId);
    writePreference(ACTIVE_KEY, tenantId);
  }, []);

  const signOut = useCallback(async () => {
    if (!backend) return;
    await backend.signOut();
    writePreference(ACTIVE_KEY, null);
    setActiveId(null);
    await applyUser(null);
  }, [backend, applyUser]);

  // The saved choice if still valid, otherwise the only business, otherwise none (person chooses).
  const activeWorkspace = useMemo(() => {
    const saved = workspaces.find((workspace) => workspace.tenantId === activeId);
    if (saved) return saved;
    return workspaces.length === 1 ? (workspaces[0] ?? null) : null;
  }, [workspaces, activeId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      workspaces,
      activeWorkspace,
      loadError,
      backend,
      selectWorkspace,
      refreshWorkspaces,
      signOut,
    }),
    [status, user, workspaces, activeWorkspace, loadError, backend, selectWorkspace, refreshWorkspaces, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
