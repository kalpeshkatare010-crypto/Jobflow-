import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { JobFlowDB, localDbName, requestPersistentStorage } from './db';
import { SyncEngine, type SyncApi, type EngineStatus } from '../sync/engine';
import { toSyncState } from '../sync/status';
import type { SyncState } from '../app/layout/SyncIndicator';
import { useAuth } from '../auth/AuthProvider';

/** How the app reaches the sync functions; null in demo mode. Tests provide a fake. */
export const SyncApiContext = createContext<SyncApi | null>(null);

interface LocalData {
  db: JobFlowDB;
  engine: SyncEngine | null;
  tenantId: string;
  syncState: SyncState;
  /** True when changes stay on this device only (demo mode). */
  localOnly: boolean;
  /** Tell the sync engine a change was saved, so it is sent promptly. */
  changed: () => void;
}

const LocalDataContext = createContext<LocalData | null>(null);

export const DEMO_TENANT_ID = '00000000-0000-4000-8000-00000000d3e0';

export function LocalDataProvider({ children }: { children: ReactNode }) {
  const { status, user, activeWorkspace } = useAuth();
  const api = useContext(SyncApiContext);
  const localOnly = status === 'demo' || !api;
  const tenantId = activeWorkspace?.tenantId ?? DEMO_TENANT_ID;
  const userId = user?.id ?? 'demo';

  const { db, engine } = useMemo(() => {
    const database = new JobFlowDB(localOnly ? 'jobflow_demo_device' : localDbName(userId, tenantId));
    const syncEngine = !localOnly && api ? new SyncEngine({ db: database, api, tenantId }) : null;
    return { db: database, engine: syncEngine };
  }, [localOnly, userId, tenantId, api]);

  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  useEffect(() => {
    if (!engine) return () => db.close();
    const unsubscribe = engine.subscribe(setEngineStatus);
    engine.start();
    return () => {
      unsubscribe();
      engine.stop();
      db.close();
    };
  }, [db, engine]);

  const value = useMemo<LocalData>(
    () => ({
      db,
      engine,
      tenantId,
      localOnly,
      syncState: engine && engineStatus ? toSyncState(engineStatus) : { kind: 'not_connected' },
      changed: () => engine?.notifyLocalChange(),
    }),
    [db, engine, tenantId, localOnly, engineStatus],
  );

  return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
}

export function useLocalData(): LocalData {
  const value = useContext(LocalDataContext);
  if (!value) throw new Error('useLocalData must be used inside <LocalDataProvider>');
  return value;
}
