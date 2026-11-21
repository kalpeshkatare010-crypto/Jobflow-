import { useCallback, useEffect, useState } from 'react';
import { isNativeApp } from './native';

/** Where signed Android builds are published (public, no key needed to read). */
export const RELEASE_API = 'https://api.github.com/repos/kalpeshkatare010-crypto/Jobflow-/releases/tags/android-latest';
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
const LAST_CHECK = 'jobflow:update-checked-at';

export interface AvailableUpdate {
  build: number;
  url: string;
  name: string;
  sizeBytes: number;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/** The newest signed build in a release, ignoring TEST builds (they cannot install over a signed app). */
export function latestSignedBuild(assets: ReleaseAsset[]): AvailableUpdate | null {
  let best: AvailableUpdate | null = null;
  for (const a of assets) {
    const m = /^JobFlow-[\d.]+-build(\d+)\.apk$/.exec(a.name);
    if (!m) continue;
    const build = Number(m[1]);
    if (!best || build > best.build) best = { build, url: a.browser_download_url, name: a.name, sizeBytes: a.size };
  }
  return best;
}

export async function installedBuild(): Promise<number> {
  const { App } = await import('@capacitor/app');
  const info = await App.getInfo();
  return Number(info.build) || 0;
}

export async function findUpdate(): Promise<{ installed: number; update: AvailableUpdate | null }> {
  const installed = await installedBuild();
  const res = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`release check failed: ${res.status}`);
  const release = (await res.json()) as { assets?: ReleaseAsset[] };
  const latest = latestSignedBuild(release.assets ?? []);
  return { installed, update: latest && latest.build > installed ? latest : null };
}

/**
 * Downloads the new app into the app's own cache and hands it to Android's
 * installer. The first time, Android asks to allow JobFlow to install apps.
 */
export async function downloadAndInstall(update: AvailableUpdate, onProgress: (fraction: number) => void): Promise<void> {
  const [{ Filesystem, Directory }, { FileOpener }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor-community/file-opener'),
  ]);
  const listener = await Filesystem.addListener('progress', (p) => {
    if (p.contentLength > 0) onProgress(Math.min(1, p.bytes / p.contentLength));
  });
  try {
    const result = await Filesystem.downloadFile({
      url: update.url,
      path: `updates/${update.name}`,
      directory: Directory.Cache,
      recursive: true,
      progress: true,
    });
    const { uri } = await Filesystem.getUri({ path: `updates/${update.name}`, directory: Directory.Cache });
    onProgress(1);
    await FileOpener.open({ filePath: result.path ?? uri, contentType: 'application/vnd.android.package-archive' });
  } finally {
    void listener.remove();
  }
}

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; installed: number }
  | { kind: 'available'; installed: number; update: AvailableUpdate }
  | { kind: 'downloading'; update: AvailableUpdate; fraction: number }
  | { kind: 'installing'; update: AvailableUpdate }
  | { kind: 'error'; message: string; update?: AvailableUpdate };

/** Checks on open and on return (at most every 3 hours); "Check now" ignores the wait. */
export function useAppUpdates() {
  const native = isNativeApp();
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });

  const check = useCallback(
    async (force = false) => {
      if (!native) return;
      const last = Number(localStorage.getItem(LAST_CHECK) ?? 0);
      if (!force && Date.now() - last < CHECK_EVERY_MS) return;
      if (force) setState({ kind: 'checking' });
      try {
        const { installed, update } = await findUpdate();
        localStorage.setItem(LAST_CHECK, String(Date.now()));
        setState(update ? { kind: 'available', installed, update } : { kind: 'current', installed });
      } catch {
        if (force) setState({ kind: 'error', message: 'Could not check for updates. Check your internet and try again.' });
      }
    },
    [native],
  );

  useEffect(() => {
    if (!native) return;
    void check();
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [native, check]);

  const install = useCallback(async (update: AvailableUpdate) => {
    setState({ kind: 'downloading', update, fraction: 0 });
    try {
      await downloadAndInstall(update, (fraction) => setState({ kind: 'downloading', update, fraction }));
      setState({ kind: 'installing', update });
    } catch {
      setState({ kind: 'error', message: 'The download did not finish. Check your internet and try again.', update });
    }
  }, []);

  return { native, state, check, install };
}
