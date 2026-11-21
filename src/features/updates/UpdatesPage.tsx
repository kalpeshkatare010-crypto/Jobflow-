import { useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw } from 'lucide-react';
import { Button, Card, CardHeader } from '../../components/ui';
import { installedBuild, useAppUpdates } from '../../app/updates';
import { CHANGELOG } from '../../app/changelog';

function mb(bytes: number) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** The dedicated Updates screen: version, check, install with progress, and what's new. */
export function UpdatesPage() {
  const { native, state, check, install } = useAppUpdates();
  const [build, setBuild] = useState<number | null>(null);
  useEffect(() => {
    if (native) void installedBuild().then(setBuild).catch(() => setBuild(null));
  }, [native]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-ink-500">Installed</p>
            <p className="tabular text-[22px] font-semibold tracking-[-0.01em]">
              JobFlow {build ? `build ${build}` : __APP_VERSION__.split(' ')[0]}
            </p>
            <p className="text-[12px] text-ink-500">v{__APP_VERSION__}</p>
          </div>
          {native ? (
            state.kind === 'available' || (state.kind === 'error' && state.update) ? null : (
              <Button
                variant="secondary"
                loading={state.kind === 'checking'}
                disabled={state.kind === 'downloading' || state.kind === 'installing'}
                onClick={() => void check(true)}
                icon={<RefreshCw aria-hidden className="size-4" />}
              >
                Check for updates
              </Button>
            )
          ) : null}
        </div>

        <div className="mt-4 border-t border-line pt-4 text-[14px]">
          {!native ? (
            <p className="text-ink-700">The website updates itself: you always get the newest version when you open it.</p>
          ) : state.kind === 'available' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                <span className="font-medium">Build {state.update.build} is ready</span>
                <span className="text-ink-500"> ({mb(state.update.sizeBytes)})</span>
              </p>
              <Button onClick={() => void install(state.update)} icon={<Download aria-hidden className="size-4" />}>
                Update now
              </Button>
            </div>
          ) : state.kind === 'downloading' ? (
            <div role="status" aria-label={`Downloading ${Math.round(state.fraction * 100)}%`}>
              <p className="mb-2">Downloading build {state.update.build}…</p>
              <div className="flex items-center gap-3">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-ink-200">
                  <span className="block h-full bg-ink-900 transition-[width]" style={{ width: `${Math.round(state.fraction * 100)}%` }} />
                </span>
                <span className="tabular text-[12px] text-ink-500">{Math.round(state.fraction * 100)}%</span>
              </div>
            </div>
          ) : state.kind === 'installing' ? (
            <p>Android’s install screen is open. Tap <span className="font-medium">Update</span> there to finish. The first time, allow JobFlow to install apps.</p>
          ) : state.kind === 'current' ? (
            <p className="flex items-center gap-2">
              <CheckCircle2 aria-hidden className="size-4 text-good" />
              You have the latest version.
            </p>
          ) : state.kind === 'error' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-critical">{state.message}</p>
                {state.detail ? <p className="mt-1 text-[12px] text-ink-500">Reason: {state.detail}</p> : null}
                {state.update ? (
                  <a className="mt-1 inline-block text-[13px] font-medium text-info hover:underline" href={state.update.url} target="_blank" rel="noreferrer">
                    Download in the browser instead
                  </a>
                ) : null}
              </div>
              {state.update ? (
                <Button onClick={() => void install(state.update!)} icon={<Download aria-hidden className="size-4" />}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-ink-700">JobFlow checks for updates when you open it. Tap Check for updates to look now.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="What's new" />
        <ol className="flex flex-col divide-y divide-line">
          {CHANGELOG.map((entry) => (
            <li key={entry.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-[12px] text-ink-500">{entry.date}</p>
              <p className="text-[14px] font-medium">{entry.title}</p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-700">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
