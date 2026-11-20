import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { EmptyState, ErrorState, Skeleton } from './States';

export interface Column<Row> {
  key: string;
  header: string;
  /** Cell content; defaults to `row[key]` as text. */
  render?: (row: Row) => ReactNode;
  align?: 'left' | 'right';
  /** Hide this column below the `sm` breakpoint to keep phone tables readable. */
  hideOnMobile?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  /** Read by screen readers; describes what the table lists. */
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  /** When set, an error message replaces the rows. */
  error?: { title: string; description: string; onRetry?: () => void };
  empty?: { title: string; description?: string; action?: ReactNode };
  onRowClick?: (row: Row) => void;
  /** Number of placeholder rows while loading. */
  skeletonRows?: number;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  empty,
  onRowClick,
  skeletonRows = 4,
}: DataTableProps<Row>) {
  if (error) {
    return <ErrorState title={error.title} description={error.description} onRetry={error.onRetry} />;
  }
  if (!loading && rows.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? 'Nothing here yet'}
        description={empty?.description}
        action={empty?.action}
      />
    );
  }

  const hidden = (column: Column<Row>) => (column.hideOnMobile ? 'hidden sm:table-cell' : '');

  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full border-collapse sm:min-w-[480px] text-sm" aria-busy={loading || undefined}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-5 pb-2.5 text-[12px] font-medium whitespace-nowrap text-ink-500 first:pl-5 sm:px-3 sm:first:pl-6 sm:last:pr-6',
                  column.align === 'right' ? 'text-right' : 'text-left',
                  hidden(column),
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }, (_, index) => (
                <tr key={`skeleton-${index}`} className="border-b border-line last:border-0">
                  {columns.map((column) => (
                    <td key={column.key} className={cn('px-5 py-3.5 sm:px-3 sm:first:pl-6 sm:last:pr-6', hidden(column))}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-line last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-sunken',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-5 py-3 align-middle text-ink-900 sm:px-3 sm:first:pl-6 sm:last:pr-6',
                        column.align === 'right' ? 'text-right tabular' : 'text-left',
                        hidden(column),
                        column.className,
                      )}
                    >
                      {column.render
                        ? column.render(row)
                        : String((row as Record<string, unknown>)[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
