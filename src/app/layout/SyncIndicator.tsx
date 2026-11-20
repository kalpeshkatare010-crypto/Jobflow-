import { CircleCheck, CloudOff, LoaderCircle, PlugZap, RefreshCw, TriangleAlert, CloudUpload, GitCompareArrows } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatRelativeTime } from '../../lib/format';

/**
 * Every state the sync engine can report. "not_connected" is used until the
 * app is linked to the cloud (Milestone 2/3); it must never claim data is synced.
 */
export type SyncState =
  | { kind: 'not_connected' }
  | { kind: 'connected'; lastSyncedAt: Date }
  | { kind: 'syncing'; pending: number }
  | { kind: 'pending'; pending: number; lastSyncedAt?: Date }
  | { kind: 'offline'; pending: number; lastSyncedAt?: Date }
  | { kind: 'failed'; pending: number; reason: string; lastSyncedAt?: Date }
  | { kind: 'conflict'; conflicts: number };

interface Presentation {
  icon: ReactNode;
  label: string;
  detail?: string;
  tone: string;
}

function changes(count: number) {
  return count === 1 ? '1 change' : `${count} changes`;
}

function lastSync(date: Date | undefined, now: Date) {
  return date ? `Last synced ${formatRelativeTime(date, now)}` : 'Not synced yet';
}

export function describeSync(state: SyncState, now: Date = new Date()): Presentation {
  const icon = 'size-4 shrink-0';
  switch (state.kind) {
    case 'not_connected':
      return {
        icon: <PlugZap aria-hidden className={icon} />,
        label: 'Not connected',
        detail: 'Demo mode: changes stay on this device only',
        tone: 'bg-sunken text-ink-700 ring-line',
      };
    case 'connected':
      return {
        icon: <CircleCheck aria-hidden className={icon} />,
        label: 'All changes synced',
        detail: lastSync(state.lastSyncedAt, now),
        tone: 'bg-good-soft text-good ring-good/15',
      };
    case 'syncing':
      return {
        icon: <LoaderCircle aria-hidden className={cn(icon, 'animate-spin')} />,
        label: 'Syncing',
        detail: `Sending ${changes(state.pending)}`,
        tone: 'bg-info-soft text-info ring-info/15',
      };
    case 'pending':
      return {
        icon: <CloudUpload aria-hidden className={icon} />,
        label: `${changes(state.pending)} waiting`,
        detail: `Saved on this device. ${lastSync(state.lastSyncedAt, now)}`,
        tone: 'bg-warning-soft text-warning ring-warning/15',
      };
    case 'offline':
      return {
        icon: <CloudOff aria-hidden className={icon} />,
        label: 'Offline',
        detail:
          state.pending > 0
            ? `${changes(state.pending)} saved on this device, not yet synced`
            : 'You can keep working; changes sync when you reconnect',
        tone: 'bg-sunken text-ink-700 ring-line',
      };
    case 'failed':
      return {
        icon: <TriangleAlert aria-hidden className={icon} />,
        label: 'Sync failed',
        detail: `${state.reason}. ${changes(state.pending)} kept on this device`,
        tone: 'bg-critical-soft text-critical ring-critical/15',
      };
    case 'conflict':
      return {
        icon: <GitCompareArrows aria-hidden className={icon} />,
        label: state.conflicts === 1 ? '1 conflict to review' : `${state.conflicts} conflicts to review`,
        detail: 'Two devices changed the same record',
        tone: 'bg-critical-soft text-critical ring-critical/15',
      };
  }
}

interface SyncIndicatorProps {
  state: SyncState;
  onRetry?: () => void;
  now?: Date;
}

export function SyncIndicator({ state, onRetry, now }: SyncIndicatorProps) {
  const view = describeSync(state, now);
  return (
    <div className="flex items-center gap-1.5">
      <div
        role="status"
        aria-live="polite"
        title={view.detail}
        className={cn('flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium ring-1 ring-inset', view.tone)}
      >
        {view.icon}
        <span className="hidden sm:inline">{view.label}</span>
        <span className="sr-only sm:hidden">{view.label}</span>
        {view.detail ? <span className="sr-only">. {view.detail}</span> : null}
      </div>
      {state.kind === 'failed' && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="grid size-9 place-items-center rounded-full text-ink-700 hover:bg-ink-900/5"
        >
          <RefreshCw aria-hidden className="size-4" />
          <span className="sr-only">Retry sync</span>
        </button>
      ) : null}
    </div>
  );
}
