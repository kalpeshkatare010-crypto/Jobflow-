import type { ReactNode } from 'react';
import { Inbox, LoaderCircle, TriangleAlert, FlaskConical } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-ink-500', className)}>
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      <span>{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block animate-pulse rounded-md bg-ink-900/[0.06]', className)} />;
}

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** An empty area tells people what will appear and what to do first. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-sunken text-ink-500">
        {icon ?? <Inbox aria-hidden className="size-5" />}
      </div>
      <p className="text-[15px] font-semibold text-ink-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  /** What happened and how to fix it. */
  description: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({ title, description, onRetry, retryLabel = 'Try again', className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-critical-soft text-critical">
        <TriangleAlert aria-hidden className="size-5" />
      </div>
      <p className="text-[15px] font-semibold text-ink-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Marks numbers that are sample data, not the business's own records. */
export function DemoTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-warning/50 px-2 text-[11px] font-medium text-warning',
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3" />
      Demo data
    </span>
  );
}
