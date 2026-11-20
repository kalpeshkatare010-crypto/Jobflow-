import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from './States';

export type MetricWash = 'peach' | 'lilac' | 'aqua' | 'mint' | 'rose' | 'sand';

const washes: Record<MetricWash, { card: string; icon: string }> = {
  peach: { card: 'bg-wash-peach', icon: 'bg-white/70 text-[#9a4a12]' },
  lilac: { card: 'bg-wash-lilac', icon: 'bg-white/70 text-[#4b3aa8]' },
  aqua: { card: 'bg-wash-aqua', icon: 'bg-white/70 text-[#13696e]' },
  mint: { card: 'bg-wash-mint', icon: 'bg-white/70 text-good' },
  rose: { card: 'bg-wash-rose', icon: 'bg-white/70 text-critical' },
  sand: { card: 'bg-wash-sand', icon: 'bg-white/70 text-[#6e5a1c]' },
};

interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  wash: MetricWash;
  /** One short line of context under the value. */
  note?: ReactNode;
  loading?: boolean;
}

export function MetricCard({ label, value, icon, wash, note, loading = false }: MetricCardProps) {
  const style = washes[wash];
  return (
    <div className={cn('flex min-h-[132px] flex-col rounded-[var(--radius-card)] p-4 sm:p-5', style.card)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-700">{label}</p>
        <span aria-hidden className={cn('grid size-8 place-items-center rounded-full', style.icon)}>
          {icon}
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-auto h-8 w-20" />
      ) : (
        <p className="tabular mt-auto pt-3 text-[28px] leading-none font-semibold tracking-[-0.02em] text-ink-900">
          {value}
        </p>
      )}
      {note ? <p className="mt-2 text-[12px] text-ink-500">{note}</p> : null}
    </div>
  );
}
