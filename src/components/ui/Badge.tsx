import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'info' | 'good' | 'warning' | 'critical' | 'signal';

const tones: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-sunken text-ink-700 ring-line', dot: 'bg-ink-400' },
  info: { box: 'bg-info-soft text-info ring-info/15', dot: 'bg-info' },
  good: { box: 'bg-good-soft text-good ring-good/15', dot: 'bg-good' },
  warning: { box: 'bg-warning-soft text-warning ring-warning/15', dot: 'bg-warning' },
  critical: { box: 'bg-critical-soft text-critical ring-critical/15', dot: 'bg-critical' },
  signal: { box: 'bg-signal-soft text-signal-ink ring-signal/40', dot: 'bg-signal' },
};

interface BadgeProps {
  tone?: BadgeTone;
  /** A small dot before the label. Status badges use it; plain tags do not. */
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', dot = false, icon, children, className }: BadgeProps) {
  const style = tones[tone];
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        style.box,
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', style.dot)} /> : null}
      {icon}
      {children}
    </span>
  );
}

/** Job lifecycle statuses (see DECISIONS.md, D-07). */
export type JobStatus = 'draft' | 'approved' | 'in_production' | 'on_hold' | 'completed' | 'delivered' | 'cancelled';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  in_production: 'In production',
  on_hold: 'On hold',
  completed: 'Completed',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const JOB_STATUS_TONE: Record<JobStatus, BadgeTone> = {
  draft: 'neutral',
  approved: 'info',
  in_production: 'signal',
  on_hold: 'warning',
  completed: 'good',
  delivered: 'good',
  cancelled: 'critical',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge tone={JOB_STATUS_TONE[status]} dot>
      {JOB_STATUS_LABEL[status]}
    </Badge>
  );
}
