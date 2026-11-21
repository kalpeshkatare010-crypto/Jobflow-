import { allTables, getMeta, type JobFlowDB, type OutboxEntry } from '../offline/db';
import { localTable, rebaseRow, SERVER_TABLES, tableForMutation, type ServerTable } from '../offline/rebase';

// -----------------------------------------------------------------------------
// Wire format (matches public.sync_push / public.sync_pull)
// -----------------------------------------------------------------------------
export interface WireMutation {
  mutationId: string;
  type: string;
  entityId: string;
  payload: unknown;
}

export interface MutationResult {
  mutationId: string;
  status: 'applied' | 'conflict' | 'rejected';
  reason?: string;
  message?: string;
  fields?: string[];
  row?: Record<string, unknown>;
  /** Child rows that changed with it (stages, history). */
  related?: Partial<Record<ServerTable, Record<string, unknown>[]>>;
}

export interface PullResponse {
  rows: Partial<Record<ServerTable, Record<string, unknown>[]>>;
  hasMore: boolean;
  cursor: Record<string, unknown>;
}

export interface SyncApi {
  push(tenantId: string, mutations: WireMutation[]): Promise<MutationResult[]>;
  pull(tenantId: string, cursor: Record<string, unknown>): Promise<PullResponse>;
}

/** The session has ended; retrying will not help until the person signs in. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Your session has ended. Sign in again to sync.');
    this.name = 'AuthExpiredError';
  }
}

// -----------------------------------------------------------------------------
// Status reported to the interface
// -----------------------------------------------------------------------------
export interface EngineStatus {
  online: boolean;
  running: boolean;
  pending: number;
  /** Changes the server refused; kept for review. */
  rejected: number;
  conflicts: number;
  lastSyncedAt: Date | null;
  lastError: string | null;
}

const PUSH_BATCH = 100;
const MAX_PULL_PAGES = 50;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;
const INTERVAL_MS = 60_000;

export interface SyncEngineOptions {
  db: JobFlowDB;
  api: SyncApi;
  tenantId: string;
  isOnline?: () => boolean;
  /** Random jitter source, replaceable in tests. */
  random?: () => number;
}

export class SyncEngine {
  private readonly db: JobFlowDB;
  private readonly api: SyncApi;
  private readonly tenantId: string;
  private readonly isOnline: () => boolean;
  private readonly random: () => number;
  private listeners = new Set<(status: EngineStatus) => void>();
  private current: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private detach: (() => void) | null = null;
  private status: EngineStatus = {
    online: true,
    running: false,
    pending: 0,
    rejected: 0,
    conflicts: 0,
    lastSyncedAt: null,
    lastError: null,
  };

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.api = options.api;
    this.tenantId = options.tenantId;
    this.isOnline = options.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    this.random = options.random ?? Math.random;
    this.status.online = this.isOnline();
  }

  // --- status ----------------------------------------------------------------
  getStatus(): EngineStatus {
    return this.status;
  }

  subscribe(listener: (status: EngineStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<EngineStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  /** Recount waiting changes and conflicts from the local database. */
  async refreshCounts(): Promise<void> {
    const [pending, rejected, conflicts, last] = await Promise.all([
      this.db.outbox.where('status').equals('pending').count(),
      this.db.outbox.where('status').equals('rejected').count(),
      this.db.conflicts.count(),
      getMeta<string | null>(this.db, 'lastSyncedAt', null),
    ]);
    this.set({ pending, rejected, conflicts, lastSyncedAt: last ? new Date(last) : null, online: this.isOnline() });
  }

  // --- lifecycle -------------------------------------------------------------
  /** Sync now and whenever the device reconnects, the app comes back into view, or a minute passes. */
  start(): void {
    if (this.detach) return;
    const onOnline = () => {
      this.set({ online: true });
      this.failures = 0;
      void this.syncNow();
    };
    const onOffline = () => this.set({ online: false });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.syncNow();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    this.intervalTimer = setInterval(() => void this.syncNow(), INTERVAL_MS);
    this.detach = () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
    void this.refreshCounts().then(() => this.syncNow());
  }

  stop(): void {
    this.detach?.();
    this.detach = null;
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.intervalTimer = null;
    this.retryTimer = null;
  }

  /** Call after saving a local change so it is sent promptly. */
  notifyLocalChange(): void {
    void this.refreshCounts().then(() => this.syncNow());
  }

  // --- the sync cycle --------------------------------------------------------
  /**
   * Runs one push-then-pull cycle. Concurrent calls share the running cycle
   * and trigger one more run afterwards, so no change waits for the timer.
   */
  syncNow(): Promise<void> {
    if (this.current) {
      this.again = true;
      return this.current;
    }
    if (!this.isOnline()) {
      this.set({ online: false });
      return Promise.resolve();
    }
    this.current = this.runExclusive()
      .finally(() => {
        this.current = null;
      })
      .then(() => {
        if (this.again) {
          this.again = false;
          return this.syncNow();
        }
      });
    return this.current;
  }

  /** Only one browser tab syncs a business at a time (Web Locks when available). */
  private async runExclusive(): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      await locks.request(`jobflow-sync-${this.db.name}`, () => this.cycle());
    } else {
      await this.cycle();
    }
  }

  private async cycle(): Promise<void> {
    this.set({ running: true, online: true });
    try {
      await this.push();
      await this.pull();
      await this.db.meta.put({ key: 'lastSyncedAt', value: new Date().toISOString() });
      this.failures = 0;
      this.set({ lastError: null });
    } catch (error) {
      this.failures += 1;
      const message = error instanceof AuthExpiredError ? error.message : describeNetworkError(error);
      this.set({ lastError: message, online: this.isOnline() });
      if (!(error instanceof AuthExpiredError)) this.scheduleRetry();
    } finally {
      await this.refreshCounts();
      this.set({ running: false });
    }
  }

  private scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = retryDelay(this.failures, this.random);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delay);
  }

  /** Send waiting changes in order. Entries leave the outbox only after the server's answer is stored. */
  private async push(): Promise<void> {
    for (;;) {
      const batch = await this.db.outbox.where('status').equals('pending').sortBy('seq');
      const slice = batch.slice(0, PUSH_BATCH);
      if (slice.length === 0) return;

      await this.db.transaction('rw', this.db.outbox, async () => {
        for (const entry of slice) await this.db.outbox.update(entry.seq!, { attempts: entry.attempts + 1 });
      });

      const results = await this.api.push(
        this.tenantId,
        slice.map((entry) => ({ mutationId: entry.mutationId, type: entry.type, entityId: entry.entityId, payload: entry.payload })),
      );
      const byId = new Map(results.map((result) => [result.mutationId, result]));

      await this.db.transaction('rw', allTables(this.db), async () => {
        for (const entry of slice) {
          const result = byId.get(entry.mutationId);
          if (result) await this.applyResult(entry, result);
        }
      });

      if (slice.length < PUSH_BATCH) return;
    }
  }

  private async applyResult(entry: OutboxEntry, result: MutationResult): Promise<void> {
    const table = tableForMutation(entry.type);
    if (result.status === 'rejected') {
      await this.db.outbox.update(entry.seq!, { status: 'rejected', reason: result.reason, message: result.message });
      const local = await localTable(this.db, table).get(entry.entityId);
      if (local) await localTable(this.db, table).put({ ...local, _sync: 'rejected', _message: result.message });
      return;
    }

    await this.db.outbox.delete(entry.seq!);

    if (result.status === 'conflict') {
      await this.db.conflicts.put({
        id: entry.mutationId,
        type: entry.type,
        entityId: entry.entityId,
        reason: result.reason ?? 'conflict',
        fields: result.fields ?? [],
        mine: entry.payload.changes ?? (entry.type.endsWith('.delete') ? { deleted: true } : { ...entry.payload }),
        theirs: result.row ?? {},
        message: result.message,
        createdAt: new Date().toISOString(),
      });
    }

    if (result.status === 'conflict' && !result.row) {
      // The server could not apply a new record (for example production on a cancelled job):
      // keep it on this device, marked, so the person sees what was not recorded.
      const local = await localTable(this.db, table).get(entry.entityId);
      if (local) await localTable(this.db, table).put({ ...local, _sync: 'conflict', _message: result.message });
    }
    if (result.row) await rebaseRow(this.db, table, result.row as Record<string, unknown> & { id: string });
    for (const [child, rows] of Object.entries(result.related ?? {})) {
      for (const row of rows ?? []) await rebaseRow(this.db, child as ServerTable, row as Record<string, unknown> & { id: string });
    }
  }

  /** Download changes since the checkpoint. Rows and the new checkpoint are saved together. */
  private async pull(): Promise<void> {
    let cursor = await getMeta<Record<string, unknown>>(this.db, 'pullCursor', {});
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const response = await this.api.pull(this.tenantId, cursor);
      await this.db.transaction('rw', allTables(this.db), async () => {
        for (const table of SERVER_TABLES) {
          for (const row of response.rows[table] ?? []) {
            await rebaseRow(this.db, table, row as Record<string, unknown> & { id: string });
          }
        }
        await this.db.meta.put({ key: 'pullCursor', value: response.cursor });
      });
      cursor = response.cursor;
      if (!response.hasMore) return;
    }
  }
}

/** 2 s, 4 s, 8 s ... up to 5 minutes, with up to 30% random jitter so devices do not retry in step. */
export function retryDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (1 + 0.3 * random()));
}

function describeNetworkError(error: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'No internet connection';
  if (error instanceof Error && error.message) return 'The server did not respond';
  return 'The server did not respond';
}
