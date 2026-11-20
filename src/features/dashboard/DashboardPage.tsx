import { lazy, Suspense, useMemo } from 'react';
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
          ? 'Your business is set up. These sample jobs and figures stay here, marked "Demo data", until your own job orders replace them in a coming update.'
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
              className={cn('block h-full rounded-full', STATUS_BAR[row.status])}
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
                {job.jobNumber} - {job.title}
              </p>
              <p className={cn('text-[12px]', tone)}>{describeDue(job.dueDate, today)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const jobs = useMemo(() => buildDemoJobs(today), [today]);
  const weekly = useMemo(() => buildDemoWeeklyOutput(today), [today]);
  const metrics = computeJobMetrics(jobs, today);

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
      render: (job) => {
        const current = job.stages.find((stage) => stage.state === 'current');
        const done = job.stages.filter((stage) => stage.state === 'done').length;
        return (
          <span className="text-[13px]">
            {current ? current.name : done === job.stages.length ? 'All stages done' : 'Not started'}
            <span className="block text-[12px] text-ink-500">
              {formatNumber(job.producedQty)} of {formatNumber(job.quantity)} {job.unit} finished
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
      <DemoNotice />

      <section aria-label="Key figures" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard wash="lilac" label="Job orders" value={formatNumber(metrics.total)} icon={<ClipboardList className="size-4" />} note="Excluding cancelled" />
        <MetricCard wash="sand" label="Pending" value={formatNumber(metrics.pending)} icon={<Clock3 className="size-4" />} note="Draft, approved or on hold" />
        <MetricCard wash="aqua" label="In production" value={formatNumber(metrics.inProduction)} icon={<Factory className="size-4" />} note="On the floor now" />
        <MetricCard wash="mint" label="Completed" value={formatNumber(metrics.completed)} icon={<CircleCheck className="size-4" />} note="Completed or delivered" />
        <MetricCard wash="rose" label="Delayed" value={formatNumber(metrics.delayed)} icon={<TriangleAlert className="size-4" />} note="Past due, still open" />
        <MetricCard wash="peach" label="Customers" value={formatNumber(DEMO_CUSTOMER_COUNT)} icon={<Users className="size-4" />} note="With at least one job" />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader
            title="Production overview"
            description={`Last 8 weeks, all stages. Rejection rate this week: ${formatPercent(weekRejection)}`}
            action={<DemoTag />}
          />
          <Suspense fallback={<Skeleton className="h-[268px] w-full" />}>
            <ProductionChart data={weekly} />
          </Suspense>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Jobs by status" description={`${jobs.length} job orders`} action={<DemoTag />} />
          <StatusBreakdown jobs={jobs} />
        </Card>

        <Card className="xl:col-span-8">
          <CardHeader
            title="On the floor"
            description="Each bar is one job's own stages, from its workflow"
            action={<DemoTag />}
          />
          <OnTheFloor jobs={jobs} today={today} />
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Upcoming deadlines" description="Open jobs due in the next 7 days" action={<DemoTag />} />
          <Deadlines jobs={jobs} today={today} />
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
          <DataTable caption="Recent job orders (demonstration data)" columns={columns} rows={recent} rowKey={(job) => job.id} />
        </Card>

        <div className="flex min-w-0 flex-col gap-5 xl:col-span-4">
          <Card>
            <CardHeader title="Recent activity" action={<DemoTag />} />
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
            <CardHeader title="Low stock" description="Below the minimum you set" action={<DemoTag />} />
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
        </div>
      </div>
    </div>
  );
}
