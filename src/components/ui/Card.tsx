import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('min-w-0 rounded-[var(--radius-card)] bg-surface p-5 sm:p-6', className)} {...rest} />;
}

interface CardHeaderProps {
  title: string;
  description?: ReactNode;
  /** Right-aligned controls, e.g. a filter or a link. */
  action?: ReactNode;
  /** Heading level for document outline; defaults to h2. */
  as?: 'h2' | 'h3';
}

export function CardHeader({ title, description, action, as: Heading = 'h2' }: CardHeaderProps) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Heading className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">{title}</Heading>
        {description ? <p className="mt-0.5 text-[13px] text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
