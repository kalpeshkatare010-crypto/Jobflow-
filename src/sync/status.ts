import type { SyncState } from '../app/layout/SyncIndicator';
import type { EngineStatus } from './engine';

/** Turns the engine's numbers into the single state the header shows. */
export function toSyncState(status: EngineStatus): SyncState {
  const lastSyncedAt = status.lastSyncedAt ?? undefined;
  if (status.conflicts > 0) return { kind: 'conflict', conflicts: status.conflicts };
  if (!status.online) return { kind: 'offline', pending: status.pending, lastSyncedAt };
  if (status.running) return { kind: 'syncing', pending: status.pending };
  if (status.lastError) return { kind: 'failed', pending: status.pending, reason: status.lastError, lastSyncedAt };
  if (status.rejected > 0) {
    return {
      kind: 'failed',
      pending: status.pending + status.rejected,
      reason: status.rejected === 1 ? '1 change was refused by the server' : `${status.rejected} changes were refused by the server`,
      lastSyncedAt,
    };
  }
  if (status.pending > 0) return { kind: 'pending', pending: status.pending, lastSyncedAt };
  if (!status.lastSyncedAt) return { kind: 'syncing', pending: 0 };
  return { kind: 'connected', lastSyncedAt: status.lastSyncedAt };
}
