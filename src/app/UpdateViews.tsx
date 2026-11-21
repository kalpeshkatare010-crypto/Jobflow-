import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../components/ui';
import { useAppUpdates, type UpdateState } from './updates';

function sizeLabel(bytes: number) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function Progress({ state }: { state: UpdateState }) {
  if (state.kind === 'downloading') {
    const pct = Math.round(state.fraction * 100);
    return (
      <div className="flex min-w-[160px] flex-1 items-center gap-2" role="status" aria-label={`Downloading ${pct}%`}>
        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-200">
          <span className="block h-full bg-ink-900 transition-[width]" style={{ width: `${pct}%` }} />
        </span>
        <span className="tabular text-[12px] text-ink-500">{pct}%</span>
      </div>
    );
  }
  if (state.kind === 'installing') return <p className="text-[13px] text-ink-700">Tap Update on Android’s screen to finish.</p>;
  return null;
}

/** Slim banner above every screen when a newer version of the Android app exists. */
export function UpdateBanner() {
  const { native, state, install } = useAppUpdates();
  const [hidden, setHidden] = useState(false);
  if (!native || hidden) return null;
  if (state.kind !== 'available' && state.kind !== 'downloading' && state.kind !== 'installing' && !(state.kind === 'error' && state.update)) return null;
  const update = 'update' in state ? state.update : undefined;
  if (!update) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-4 py-3 text-[13px]">
      <Download aria-hidden className="size-4 shrink-0 text-ink-500" />
      <span className="min-w-0 flex-1">
        {state.kind === 'error' ? state.message : <>A new version of JobFlow is ready ({sizeLabel(update.sizeBytes)}).</>}
      </span>
      <Progress state={state} />
      {state.kind === 'available' || state.kind === 'error' ? (
        <span className="flex gap-2">
          <Button size="sm" onClick={() => void install(update)}>
            {state.kind === 'error' ? 'Try again' : 'Update'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setHidden(true)}>
            Later
          </Button>
        </span>
      ) : null}
    </div>
  );
}
