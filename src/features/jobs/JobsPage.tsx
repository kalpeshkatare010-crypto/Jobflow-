import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ClipboardList, Plus, Search, TriangleAlert } from 'lucide-react';
import { Button, Card, DataTable, EmptyState, JobStatusBadge, JOB_STATUS_LABEL, Panel, StageTrack, type Column, type JobStatus } from '../../components/ui';
import { SyncBadge } from '../../components/SyncBadge';
import { useLocalData } from '../../offline/LocalDataProvider';
import { useAuth } from '../../auth/AuthProvider';
import { isDelayed } from '../../domain/jobs';
import { formatNumber, formatShortDate } from '../../lib/format';
import { cn } from '../../lib/cn';
import { localDate, stageSegments, toSummary, UNNUMBERED, useJobViews, type JobView } from './jobData';
import { JobForm } from './JobForm';
import { JobDetail } from './JobDetail';

const FILTERS: { value: 'open' | 'all' | JobStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_production', label: 'In production' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

const OPEN: JobStatus[] = ['draft', 'approved', 'in_production', 'on_hold'];

export function JobsPage() {
  const { db, localOnly } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  const canManage = status === 'demo' || (activeWorkspace !== null && activeWorkspace.role !== 'employee');

  const views = useJobViews(db);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('open');
  const [panel, setPanel] = useState<{ mode: 'new' } | { mode: 'view' | 'edit'; id: string } | null>(null);

  // "?new=1" opens the new-job form (used by links and widgets).
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') === '1') {
      setParams({}, { replace: true });
      if (canManage) setPanel({ mode: 'new' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const today = useMemo(() => new Date(), []);
  const visible = useMemo(() => {
    if (!views) return undefined;
    const q = query.trim().toLowerCase();
    return views.filter(({ job, customer }) => {
      if (filter === 'open' && !OPEN.includes(job.status)) return false;
      if (filter !== 'open' && filter !== 'all' && job.status !== filter) return false;
      if (!q) return true;
      return [job.job_number, job.title, customer?.name, customer?.business_name].some((v) => v?.toLowerCase().includes(q));
    });
  }, [views, query, filter]);

  const current = panel && panel.mode !== 'new' ? views?.find((v) => v.job.id === panel.id) : undefined;

  const columns: Column<JobView>[] = [
    {
      key: 'job',
      header: 'Job',
      render: (view) => (
        <div className="min-w-0">
          <p className="tabular text-[13px] font-semibold">{view.job.job_number ?? <span className="font-normal text-ink-500">{UNNUMBERED}</span>}</p>
          <p className="max-w-[150px] truncate text-[13px] text-ink-700 sm:max-w-[240px]">{view.job.title}</p>
          <p className="max-w-[150px] truncate text-[12px] text-ink-500 sm:hidden">{view.customer?.name}</p>
          {view.job.due_date ? (
            <p className="text-[12px] text-ink-500 sm:hidden">
              Due <DueText view={view} today={today} />
            </p>
          ) : null}
        </div>
      ),
    },
    { key: 'customer', header: 'Customer', hideOnMobile: true, render: ({ customer }) => customer?.name ?? '' },
    {
      key: 'progress',
      header: 'Stage',
      hideOnMobile: true,
      className: 'min-w-[180px]',
      render: ({ stages }) => <StageTrack stages={stageSegments(stages)} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (view) => (
        <span className="flex flex-col items-start gap-1">
          <JobStatusBadge status={view.job.status} />
          <SyncBadge mark={view.job._sync} localOnly={localOnly} />
        </span>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      align: 'right',
      hideOnMobile: true,
      render: (view) => (view.job.due_date ? <DueText view={view} today={today} /> : <span className="text-ink-400">-</span>),
    },
  ];

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const { job } of views ?? []) {
      map.set(job.status, (map.get(job.status) ?? 0) + 1);
      if (OPEN.includes(job.status)) map.set('open', (map.get('open') ?? 0) + 1);
    }
    map.set('all', views?.length ?? 0);
    return map;
  }, [views]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search jobs</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by job number, name or customer"
            className="h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-400 focus:border-info focus:ring-2 focus:ring-info/30 focus:outline-none"
          />
        </label>
        {canManage ? (
          <Button onClick={() => setPanel({ mode: 'new' })} icon={<Plus aria-hidden className="size-4" />}>
            New job
          </Button>
        ) : null}
      </div>

      <div role="tablist" aria-label="Filter by status" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            type="button"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'press flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium',
              filter === f.value ? 'bg-ink-900 text-on-ink' : 'bg-surface text-ink-700 hover:bg-sunken',
            )}
          >
            {f.label}
            <span className={cn('tabular text-[12px]', filter === f.value ? 'opacity-70' : 'text-ink-400')}>{counts.get(f.value) ?? 0}</span>
          </button>
        ))}
      </div>

      <Card>
        {views && views.length === 0 ? (
          <EmptyState
            icon={<ClipboardList aria-hidden className="size-5" />}
            title="No job orders yet"
            description="Create a job for a customer, pick its workflow, and track every stage from here or the shop floor."
            action={
              canManage ? (
                <Button onClick={() => setPanel({ mode: 'new' })} icon={<Plus aria-hidden className="size-4" />}>
                  Create the first job
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption="Job orders"
            columns={columns}
            rows={visible ?? []}
            loading={visible === undefined}
            rowKey={(v) => v.job.id}
            onRowClick={(v) => setPanel({ mode: 'view', id: v.job.id })}
            empty={{ title: filter === 'open' && !query ? 'No open jobs' : 'No jobs match', description: 'Try another status or search.' }}
          />
        )}
      </Card>

      <Panel
        open={panel !== null}
        title={
          panel?.mode === 'new'
            ? 'New job'
            : panel?.mode === 'edit'
              ? 'Edit job'
              : current
                ? `${current.job.job_number ?? 'Job'} - ${JOB_STATUS_LABEL[current.job.status]}`
                : 'Job'
        }
        onClose={() => setPanel(null)}
        footer={
          panel?.mode === 'new' || panel?.mode === 'edit' ? (
            <>
              <Button type="submit" form="job-form">
                {panel.mode === 'new' ? 'Create job' : 'Save changes'}
              </Button>
              <Button variant="secondary" onClick={() => setPanel(panel.mode === 'edit' ? { mode: 'view', id: panel.id } : null)}>
                Cancel
              </Button>
            </>
          ) : undefined
        }
      >
        {panel?.mode === 'new' ? <JobForm key="new" job={null} onSaved={(id) => setPanel({ mode: 'view', id })} /> : null}
        {panel?.mode === 'edit' && current ? (
          <JobForm key={`edit-${current.job.id}`} job={current.job} onSaved={(id) => setPanel({ mode: 'view', id })} />
        ) : null}
        {panel?.mode === 'view' && current ? (
          <JobDetail view={current} canManage={canManage} onEdit={() => setPanel({ mode: 'edit', id: current.job.id })} />
        ) : null}
      </Panel>
      {views && views.length > 0 ? (
        <p className="text-[12px] text-ink-500">
          {formatNumber(counts.get('open') ?? 0)} open job{counts.get('open') === 1 ? '' : 's'}.{' '}
          {localOnly ? 'Demo mode: jobs are saved on this device only.' : null}
        </p>
      ) : null}
    </div>
  );
}

function DueText({ view, today }: { view: JobView; today: Date }) {
  const due = localDate(view.job.due_date);
  if (!due) return null;
  const late = isDelayed(toSummary(view), today);
  return (
    <span className={cn('inline-flex items-center gap-1 sm:text-[13px]', late ? 'font-medium text-critical' : 'max-sm:text-ink-500')}>
      {late ? <TriangleAlert aria-hidden className="size-3.5" /> : null}
      {formatShortDate(due, today)}
    </span>
  );
}
