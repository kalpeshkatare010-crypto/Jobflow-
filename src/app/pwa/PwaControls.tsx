import { Download, RefreshCw, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAppUpdate, useInstallPrompt } from './usePwa';

/** Sidebar button shown only when the browser can install JobFlow. */
export function InstallAppButton({ collapsed = false }: { collapsed?: boolean }) {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return (
    <button
      type="button"
      onClick={() => void install()}
      title={collapsed ? 'Install JobFlow app' : undefined}
      className={cn(
        'press flex h-10 items-center gap-3 rounded-[var(--radius-control)] bg-surface text-sm font-medium text-ink-900 hover:bg-sunken',
        collapsed ? 'justify-center' : 'px-3',
      )}
    >
      <Download aria-hidden className="size-[18px] shrink-0" />
      <span className={collapsed ? 'sr-only' : undefined}>Install JobFlow app</span>
    </button>
  );
}

/** Bottom notice when a new version has downloaded. */
export function UpdateNotice() {
  const { updateReady, applyUpdate, dismiss } = useAppUpdate();
  if (!updateReady) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex animate-toast-in max-w-md items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-white shadow-[var(--shadow-pop)]"
    >
      <RefreshCw aria-hidden className="size-4 shrink-0 text-signal" />
      <p className="flex-1">A new version of JobFlow is ready.</p>
      <button type="button" onClick={applyUpdate} className="rounded-lg bg-signal px-3 py-1.5 font-medium text-ink-900">
        Reload
      </button>
      <button type="button" onClick={dismiss} className="grid size-8 place-items-center rounded-lg hover:bg-white/10">
        <X aria-hidden className="size-4" />
        <span className="sr-only">Later</span>
      </button>
    </div>
  );
}
