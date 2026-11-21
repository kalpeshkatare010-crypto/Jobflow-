import { lazy, Suspense, useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import {
  ClipboardList,
  Clock3,
  Factory,
  CircleCheck,
  TriangleAlert,
  Users,
  FlaskConical,
  PackageX,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  DataTable,
  DemoTag,
  JobStatusBadge,
  JOB_STATUS_LABEL,
  MetricCard,
  StageTrack,
  Skeleton,
  type Column,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocalData } from '../../offline/LocalDataProvider';
import { toSummary, UNNUMBERED, useJobViews } from '../jobs/jobData';
import { weeklyOutput } from '../../domain/production';
import { JOB_STATUS_LABEL as STATUS_TEXT } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { describeDue, formatNumber, formatPercent, formatRelativeTime, formatShortDate, daysUntil } from '../../lib/format';
import {
  computeJobMetrics,
  countByStatus,
  isDelayed,
  rejectionRate,
  upcomingDeadlines,
  type JobSummary,
} from '../../domain/jobs';
import {
  buildDemoJobs,
  buildDemoWeeklyOutput,
  DEMO_ACTIVITY,
  DEMO_CUSTOMER_COUNT,
  DEMO_LOW_STOCK,
} from './demoData';
// Recharts is large, so the chart loads in its own file after the page appears.
const ProductionChart = lazy(() => import('./ProductionChart').then((m) => ({ default: m.ProductionChart })));

const STATUS_BAR: Record<string, string> = {
  draft: 'bg-ink-200',
  approved: 'bg-info',
  in_production: 'bg-signal',
  on_hold: 'bg-warning',
  completed: 'bg-good',
  delivered: 'bg-good/60',
  cancelled: 'bg-critical',
};

function DemoNotice() {
  const { status } = useAuth();
  return (
    <div
      role="note"
      className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-warning/40 bg-warning-soft/60 px-4 py-3 text-sm text-ink-700"
    >
      <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
      <p>
        <span className="font-medium text-ink-900">You are looking at demonstration data.</span>{' '}
        {status === 'signed_in'
          ? 'Your business is set up. These sample jobs and figures stay here, marked "Demo data", until you create your first job order.'
          : 'These jobs, customers and figures are invented samples. Your own records will replace them once your business is set up.'}
      </p>
    </div>
  );
}

function StatusBreakdown({ jobs }: { jobs: JobSummary[] }) {
  const rows = countByStatus(jobs).filter((row) => row.count > 0);
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.status} className="grid grid-cols-[96px_1fr_24px] items-center gap-3 text-[13px]">
          <span className="text-ink-700">{JOB_STATUS_LABEL[row.status]}</span>
          <span className="h-2 rounded-full bg-ink-900/[0.06]">
            <span
              className={cn('block h-full origin-left animate-grow-x rounded-full', STATUS_BAR[row.status])}
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </span>
          <span className="tabular text-right font-medium text-ink-900">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

function OnTheFloor({ jobs, today }: { jobs: JobSummary[]; today: Date }) {
  const active = jobs.filter((job) => job.status === 'in_production' || job.status === 'on_hold');
  return (
    <ul className="divide-y divide-line">
      {active.map((job) => {
        const late = isDelayed(job, today);
        return (
          <li key={job.id} className="grid gap-x-6 gap-y-2 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="tabular text-[13px] font-semibold text-ink-900">{job.jobNumber}</span>
                {job.status === 'on_hold' ? <Badge tone="warning" dot>On hold</Badge> : null}
                {late ? <Badge tone="critical" icon={<TriangleAlert aria-hidden className="size-3" />}>Delayed</Badge> : null}
              </p>
              <p className="mt-0.5 truncate text-sm text-ink-700">{job.title}</p>
              <p className="truncate text-[12px] text-ink-500">
                {job.customerName} - {formatNumber(job.quantity)} {job.unit}
              </p>
            </div>
            <StageTrack stages={job.stages} className="self-center" />
          </li>
        );
      })}
    </ul>
  );
}

function Deadlines({ jobs, today }: { jobs: JobSummary[]; today: Date }) {
  const due = upcomingDeadlines(jobs, today, 7).slice(0, 5);
  return (
    <ul className="flex flex-col gap-2.5">
      {due.map((job) => {
        const days = daysUntil(job.dueDate, today);
        const tone = days < 0 ? 'text-critical' : days <= 1 ? 'text-warning' : 'text-ink-500';
        return (
          <li key={job.id} className="flex items-center gap-3 rounded-[var(--radius-control)] bg-sunken px-3 py-2.5">
            <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-surface py-1 text-center leading-tight">
              <span className="text-[11px] text-ink-500">
                {new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(job.dueDate)}
              </span>
              <span className="tabular text-[15px] font-semibold text-ink-900">{job.dueDate.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink-900">
                {job.jobNumber === UNNUMBERED ? job.title : `${job.jobNumber} - ${job.title}`}
              </p>
              <p className={cn('text-[12px]', tone)}>{describeDue(job.dueDate, today)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ComingSoon({ title, text }: { title: string; text: string }) {
  return (
    <Card>
      <CardHeader title={title} />
      <p className="text-[13px] text-ink-500">{text}</p>
    </Card>
  );
}

function Quiet({ text }: { text: string }) {
  return <p className="text-[13px] text-ink-500">{text}</p>;
}

/** The business's own recent job history, newest first. */
function useRecentActivity() {
  const { db } = useLocalData();
  return useLiveQuery(async () => {
    const [events, jobs] = await Promise.all([db.jobEvents.orderBy('created_at').reverse().limit(6).toArray(), db.jobOrders.toArray()]);
    const byId = new Map(jobs.map((j) => [j.id, j]));
    return events.map((e) => {
      const job = byId.get(e.job_id);
      const name = job?.job_number ?? (job ? `“${job.title}”` : 'a job');
      let what = `updated ${name}`;
      if (e.kind === 'created') what = `created ${name}`;
      else if (e.kind === 'edited') what = `edited ${name}`;
      else if (e.kind === 'status') what = `moved ${name} to ${STATUS_TEXT[e.to_status as keyof typeof STATUS_TEXT] ?? e.to_status}`;
      else if (e.kind === 'stage') {
        const verb = { start: 'started', complete: 'finished', skip: 'skipped', reopen: 'reopened' }[e.stage_action ?? ''] ?? 'updated';
        what = `${verb} ${e.stage_name ?? 'a stage'} on ${name}`;
      }
      return { id: e.id, who: e.actor_name ?? (e._local ? 'You' : 'Someone'), what, at: new Date(e.created_at) };
    });
  }, [db]);
}

export function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const { db } = useLocalData();
  const views = useJobViews(db);
  const customerCount = useLiveQuery(async () => (await db.customers.toArray()).filter((c) => !c.deleted_at).length, [db]);
  const activity = useRecentActivity();
  const realJobs = useMemo(() => (views && views.length > 0 ? views.map(toSummary) : null), [views]);
  const demo = realJobs === null;
  const demoJobs = useMemo(() => buildDemoJobs(today), [today]);
  const jobs = realJobs ?? demoJobs;
  const realWeekly = useMemo(() => {
    if (!views || views.length === 0) return null;
    const outputStages = new Set(views.flatMap((v) => v.stages.filter((st) => st.counts_output).map((st) => st.id)));
    return weeklyOutput(views.flatMap((v) => v.entries), outputStages, today);
  }, [views, today]);
  const weekly = useMemo(() => realWeekly ?? buildDemoWeeklyOutput(today), [realWeekly, today]);
  const hasOutput = (realWeekly ?? []).some((w) => w.good > 0 || w.rejected > 0);
  const metrics = computeJobMetrics(jobs, today);
  const tag = demo ? <DemoTag /> : undefined;

  const lastWeek = weekly[weekly.length - 1];
  const weekRejection = lastWeek ? rejectionRate(lastWeek.good, lastWeek.rejected) : 0;

  const recent = jobs.slice(0, 6);
  const columns: Column<JobSummary>[] = [
    {
      key: 'job',
      header: 'Job',
      render: (job) => (
        <div className="min-w-0">
          <p className="tabular text-[13px] font-semibold">{job.jobNumber}</p>
          <p className="max-w-[220px] truncate text-[12px] text-ink-500">{job.title}</p>
        </div>
      ),
    },
    { key: 'customerName', header: 'Customer', hideOnMobile: true },
    { key: 'status', header: 'Status', render: (job) => <JobStatusBadge status={job.status} /> },
    {
      key: 'progress',
      header: 'Progress',
      hideOnMobile: true,
      render: (job) => {
        const current = job.stages.find((stage) => stage.state === 'current');
        const done = job.stages.filter((stage) => stage.state === 'done').length;
        return (
          <span className="text-[13px]">
            {current ? current.name : done === job.stages.length ? 'All stages done' : 'Not started'}
            <span className="block text-[12px] text-ink-500">
              {`${formatNumber(job.producedQty)} of ${formatNumber(job.quantity)} ${job.unit} finished`}
              {demo ? null : ` (${done} of ${job.stages.length} stages done)`}
            </span>
          </span>
        );
      },
    },
    {
      key: 'due',
      header: 'Due',
      align: 'right',
      hideOnMobile: true,
      render: (job) => (
        <span className={cn('text-[13px]', isDelayed(job, today) && 'font-medium text-critical')}>
          {formatShortDate(job.dueDate, today)}
        </span>
      ),
    },
  ];

  return (
    <div>
      {views === undefined ? null : demo ? <DemoNotice /> : null}

      <section aria-label="Key figures" className="stagger mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard wash="lilac" label="Job orders" value={formatNumber(metrics.total)} icon={<ClipboardList className="size-4" />} note="Excluding cancelled" />
        <MetricCard wash="sand" label="Pending" value={formatNumber(metrics.pending)} icon={<Clock3 className="size-4" />} note="Draft, approved or on hold" />
        <MetricCard wash="aqua" label="In production" value={formatNumber(metrics.inProduction)} icon={<Factory className="size-4" />} note="On the floor now" />
        <MetricCard wash="mint" label="Completed" value={formatNumber(metrics.completed)} icon={<CircleCheck className="size-4" />} note="Completed or delivered" />
        <MetricCard wash="rose" label="Delayed" value={formatNumber(metrics.delayed)} icon={<TriangleAlert className="size-4" />} note="Past due, still open" />
        <MetricCard wash="peach" label="Customers" value={formatNumber(demo ? DEMO_CUSTOMER_COUNT : (customerCount ?? 0))} icon={<Users className="size-4" />} note={demo ? 'With at least one job' : 'Saved customers'} />
      </section>

      <div className="stagger grid grid-cols-1 gap-5 xl:grid-cols-12" style={{ '--stagger-base': '180ms' } as CSSProperties}>
        {demo || hasOutput ? (
          <Card className="xl:col-span-8">
            <CardHeader
              title="Production overview"
              description={
                demo
                  ? `Last 8 weeks, all stages. Rejection rate this week: ${formatPercent(weekRejection)}`
                  : `Finished output and rejections, last 8 weeks. Rejection rate this week: ${formatPercent(weekRejection)}`
              }
              action={tag}
            />
            <Suspense fallback={<Skeleton className="h-[268px] w-full" />}>
              <ProductionChart data={weekly} />
            </Suspense>
          </Card>
        ) : (
          <div className="xl:col-span-8">
            <ComingSoon
              title="Production overview"
              text="No production recorded in the last 8 weeks. Use Record on a job's stage, or the Production screen, and the weekly chart appears here."
            />
          </div>
        )}

        <Card className="xl:col-span-4">
          <CardHeader title="Jobs by status" description={`${jobs.length} job order${jobs.length === 1 ? "" : "s"}`} action={tag} />
          <StatusBreakdown jobs={jobs} />
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader
            title="On the floor"
            description="Each bar is one job's own stages, from its workflow"
            action={tag}
          />
          {jobs.some((j) => j.status === 'in_production' || j.status === 'on_hold') ? (
            <OnTheFloor jobs={jobs} today={today} />
          ) : (
            <Quiet text="No job is in production right now. Start a stage on an approved job and it appears here." />
          )}
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Upcoming deadlines" description="Open jobs due in the next 7 days" action={tag} />
          {upcomingDeadlines(jobs, today, 7).length > 0 ? <Deadlines jobs={jobs} today={today} /> : <Quiet text="Nothing due in the next 7 days." />}
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader
            title="Recent job orders"
            action={
              <Link to="/jobs" className="text-[13px] font-medium text-info hover:underline">
                View all jobs
              </Link>
            }
          />
          <DataTable caption={demo ? 'Recent job orders (demonstration data)' : 'Recent job orders'} columns={columns} rows={recent} rowKey={(job) => job.id} />
        </Card>

        <div className="flex min-w-0 flex-col gap-5 xl:col-span-4">
          {demo ? (
            <>
              <Card>
                <CardHeader title="Recent activity" action={tag} />
                <ul className="flex flex-col gap-3">
                  {DEMO_ACTIVITY.map((item) => (
                    <li key={item.id} className="text-[13px] leading-snug">
                      <p className="text-ink-700">
                        <span className="font-medium text-ink-900">{item.who}</span> {item.what}
                      </p>
                      <p className="text-[12px] text-ink-500">
                        {formatRelativeTime(new Date(today.getTime() - item.minutesAgo * 60000), today)}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Low stock" description="Below the minimum you set" action={tag} />
                <ul className="flex flex-col gap-3">
                  {DEMO_LOW_STOCK.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 text-[13px]">
                      <PackageX aria-hidden className="size-4 shrink-0 text-critical" />
                      <span className="min-w-0 flex-1 truncate text-ink-900">{item.material}</span>
                      <span className="tabular shrink-0 text-ink-500">
                        <span className="font-medium text-critical">
                          {formatNumber(item.onHand)} {item.unit}
                        </span>{' '}
                        of {formatNumber(item.minimum)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <>
              <Card>
                <CardHeader title="Recent activity" />
                <ul className="flex flex-col gap-3">
                  {(activity ?? []).map((item) => (
                    <li key={item.id} className="text-[13px] leading-snug">
                      <p className="text-ink-700">
                        <span className="font-medium text-ink-900">{item.who}</span> {item.what}
                      </p>
                      <p className="text-[12px] text-ink-500">{formatRelativeTime(item.at, today)}</p>
                    </li>
                  ))}
                </ul>
              </Card>
              <ComingSoon title="Low stock" text="Stock levels and low-stock alerts arrive with the inventory update." />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
