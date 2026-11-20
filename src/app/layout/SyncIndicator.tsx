import { CircleCheck, CloudOff, LoaderCircle, PlugZap, RefreshCw, TriangleAlert, CloudUpload, GitCompareArrows } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  /** Start a sync now (absent in demo mode). */
  onRetry?: () => void;
  now?: Date;
}

/** Plain-words explanation shown when the status is tapped. */
function explain(state: SyncState): string {
  switch (state.kind) {
    case 'not_connected':
      return 'This copy of JobFlow is in demo mode. What you add is saved on this device only and is not sent to the cloud.';
    case 'connected':
      return 'Everything you saved on this device is also safely in the cloud.';
    case 'syncing':
      return 'Sending your changes to the cloud and fetching changes from your team.';
    case 'pending':
      return 'These changes are saved on this device. They will be sent to the cloud in a moment.';
    case 'offline':
      return 'No internet right now. Keep working: everything is saved on this device and is sent when you are back online.';
    case 'failed':
      return 'The last try did not finish. Your changes are kept on this device and JobFlow will try again by itself.';
    case 'conflict':
      return 'Someone else changed the same record at the same time. Open the record marked "Needs review" to choose which version to keep.';
  }
}

export function SyncIndicator({ state, onRetry, now }: SyncIndicatorProps) {
  const view = describeSync(state, now);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const canSyncNow = onRetry && state.kind !== 'syncing' && state.kind !== 'not_connected';

  return (
    <div ref={root} className="relative flex items-center gap-1.5">
      <span role="status" aria-live="polite" className="sr-only">
        {view.label}
        {view.detail ? `. ${view.detail}` : ''}
      </span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn('press flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium ring-1 ring-inset', view.tone)}
      >
        {view.icon}
        <span className="hidden sm:inline">{view.label}</span>
        <span className="sr-only sm:hidden">Sync status: {view.label}</span>
      </button>
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
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Sync status"
          className="absolute top-11 right-0 z-30 w-[min(300px,calc(100vw-32px))] origin-top-right animate-pop-in rounded-xl bg-surface p-4 text-left shadow-[var(--shadow-pop)] ring-1 ring-line"
        >
          <p className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[13px] font-medium ring-1 ring-inset', view.tone)}>
            {view.icon}
            {view.label}
          </p>
          <p className="mt-3 text-sm text-ink-700">{explain(state)}</p>
          {view.detail && state.kind !== 'not_connected' ? <p className="mt-2 text-[13px] text-ink-500">{view.detail}</p> : null}
          {canSyncNow ? (
            <button
              type="button"
              onClick={() => {
                onRetry?.();
                setOpen(false);
              }}
              className="press mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-ink-900 text-[13px] font-medium text-on-ink hover:bg-ink-700"
            >
              <RefreshCw aria-hidden className="size-4" />
              Sync now
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
