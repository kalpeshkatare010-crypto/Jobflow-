import type { ReactNode } from 'react';
import { Skeleton } from './States';

export type MetricWash = 'peach' | 'lilac' | 'aqua' | 'mint' | 'rose' | 'sand';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  /** Kept for compatibility; tiles are no longer tinted. */
  wash?: MetricWash;
  /** One short line of context under the value. */
  note?: ReactNode;
  loading?: boolean;
}

export function MetricCard({ label, value, icon, note, loading = false }: MetricCardProps) {
  // Plain, bordered tiles: the number is the point; the icon is a small muted hint.
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
        <span aria-hidden className="text-ink-400 [&>svg]:size-3.5">
          {icon}
        </span>
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-16" />
      ) : (
        <p className="tabular mt-2 text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink-900">{value}</p>
      )}
      {note ? <p className="mt-1.5 text-[12px] leading-snug text-ink-500">{note}</p> : null}
    </div>
  );
}
