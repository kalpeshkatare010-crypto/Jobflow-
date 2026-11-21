import { cn } from '../../lib/cn';

/**
 * JobFlow mark: three stepped bars, a job moving through stages.
 * The last bar is signal yellow, the stage in progress.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#171717" />
      <rect x="7" y="18" width="5" height="7" rx="1.5" fill="#FFFFFF" />
      <rect x="13.5" y="13" width="5" height="12" rx="1.5" fill="#FFFFFF" />
      <rect x="20" y="7" width="5" height="18" rx="1.5" fill="#F2D24B" />
    </svg>
  );
}

export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {collapsed ? null : (
        <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink-900">JobFlow</span>
      )}
    </div>
  );
}
