import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleCheck, CircleX, Factory, Percent, Plus, TriangleAlert } from 'lucide-react';
import { Button, Card, DataTable, EmptyState, Input, MetricCard, Panel, Select, Textarea, type Column } from '../../components/ui';
import { SyncBadge } from '../../components/SyncBadge';
import { FormError } from '../../auth/AuthLayout';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalData } from '../../offline/LocalDataProvider';
import type { EmployeeRecord, ProductionEntryRecord } from '../../offline/db';
import { ValidationError } from '../../offline/customers';
import { counts, discardUnrecordedEntry, recordProduction, voidProduction } from '../../offline/production';
import { rejectionShare, todayIso } from '../../domain/production';
import { formatNumber, formatPercent } from '../../lib/format';
import { cn } from '../../lib/cn';
import { localDate, UNNUMBERED, useJobViews, type JobView } from '../jobs/jobData';

const RANGES = [
  { value: 1, label: 'Today' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 0, label: 'All' },
] as const;

/** Jobs that can take production from the form. */
const RECORDABLE = new Set(['approved', 'in_production', 'on_hold']);

interface Row {
  entry: ProductionEntryRecord;
  view: JobView | undefined;
  stageName: string;
  employee: string | null;
}

function jobLabel(view: JobView): string {
  return `${view.job.job_number ?? UNNUMBERED} - ${view.job.title}`;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return todayIso(d);
}

function useEmployees() {
  const { db } = useLocalData();
  return useLiveQuery(
    async () => (await db.employees.toArray()).filter((e) => !e.deleted_at && e.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [db],
  );
}

export function ProductionPage() {
  const { db, localOnly } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  // Recording is open to every role (D-22); voiding is for managers and above.
  const canVoid = status === 'demo' || (activeWorkspace !== null && activeWorkspace.role !== 'employee');
  const views = useJobViews(db);
  const employees = useEmployees();
  const [range, setRange] = useState<number>(7);
  const [panel, setPanel] = useState<{ mode: 'new'; jobId?: string; stageId?: string } | { mode: 'view'; id: string } | null>(null);

  // /production?job=…&stage=… opens the form for that stage (from a job's panel).
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const job = params.get('job');
    if (job || params.get('new') === '1') {
      setPanel({ mode: 'new', jobId: job ?? undefined, stageId: params.get('stage') ?? undefined });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const rows = useMemo<Row[] | undefined>(() => {
    if (!views || !employees) return undefined;
    const allEmployees = new Map<string, EmployeeRecord>(employees.map((e) => [e.id, e]));
    const out: Row[] = [];
    const since = range === 0 ? '' : daysAgoIso(range - 1);
    for (const view of views) {
      for (const entry of view.entries) {
        if (entry.entry_date < since) continue;
        out.push({
          entry,
          view,
          stageName: view.stages.find((s) => s.id === entry.job_stage_id)?.name ?? 'Stage',
          employee: entry.employee_id ? (allEmployees.get(entry.employee_id)?.name ?? null) : null,
        });
      }
    }
    return out.sort((a, b) => b.entry.entry_date.localeCompare(a.entry.entry_date) || b.entry.created_at.localeCompare(a.entry.created_at));
  }, [views, employees, range]);

  const summary = useMemo(() => {
    let good = 0;
    let rejected = 0;
    let unrecorded = 0;
    for (const { entry } of rows ?? []) {
      if (entry._sync === 'rejected' || entry._sync === 'conflict') unrecorded += 1;
      if (!counts(entry)) continue;
      good += Number(entry.good_qty);
      rejected += Number(entry.rejected_qty);
    }
    return { good, rejected, unrecorded };
  }, [rows]);

  const recordable = (views ?? []).filter((v) => RECORDABLE.has(v.job.status));
  const current = panel?.mode === 'view' ? rows?.find((r) => r.entry.id === panel.id) : undefined;

  const columns: Column<Row>[] = [
    {
      key: 'what',
      header: 'Job and stage',
      render: ({ entry, view, stageName, employee }) => (
        <div className={cn('min-w-0', entry.voided_at && 'text-ink-400 line-through')}>
          <p className="max-w-[170px] truncate text-[13px] font-medium sm:max-w-[260px]">{view ? jobLabel(view) : 'Job'}</p>
          <p className="truncate text-[12px] text-ink-500">
            {stageName}
            {employee ? `, ${employee}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      hideOnMobile: true,
      render: ({ entry }) => localDate(entry.entry_date)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    },
    {
      key: 'qty',
      header: 'Good / rejected',
      align: 'right',
      render: ({ entry }) => (
        <span className="flex flex-col items-end gap-1">
          <span className={cn('tabular text-[13px]', entry.voided_at && 'text-ink-400 line-through')}>
            {formatNumber(Number(entry.good_qty))}
            {Number(entry.rejected_qty) > 0 ? <span className="text-critical"> / {formatNumber(Number(entry.rejected_qty))}</span> : null}
          </span>
          {entry.voided_at ? (
            <span className="text-[11px] text-ink-500">Voided</span>
          ) : (
            <SyncBadge mark={entry._sync} localOnly={localOnly} />
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Period" className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              role="tab"
              type="button"
              aria-selected={range === r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                'press h-8 rounded-full px-3 text-[13px] font-medium',
                range === r.value ? 'bg-ink-900 text-on-ink' : 'bg-surface text-ink-700 hover:bg-sunken',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setPanel({ mode: 'new' })} icon={<Plus aria-hidden className="size-4" />}>
          Record production
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard wash="mint" label="Good" value={formatNumber(summary.good)} icon={<CircleCheck className="size-4" />} note="All stages, this period" />
        <MetricCard wash="rose" label="Rejected" value={formatNumber(summary.rejected)} icon={<CircleX className="size-4" />} note="All stages, this period" />
        <MetricCard
          wash="sand"
          icon={<Percent className="size-4" />}
          label="Rejection rate"
          value={formatPercent(rejectionShare(summary.good, summary.rejected))}
          note="Rejected out of everything made"
        />
      </div>

      {summary.unrecorded > 0 ? (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-warning/10 p-3 text-[13px]">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {summary.unrecorded === 1 ? 'One entry was' : `${summary.unrecorded} entries were`} not recorded by the server. Open it to see why.
        </p>
      ) : null}

      <Card>
        {rows && rows.length === 0 && range === 0 ? (
          <EmptyState
            icon={<Factory aria-hidden className="size-5" />}
            title="No production recorded yet"
            description={
              recordable.length > 0
                ? 'Record good and rejected quantities for each stage as work is done. It works offline too.'
                : 'Approve a job first, then record what each stage produces.'
            }
            action={
              recordable.length > 0 ? (
                <Button onClick={() => setPanel({ mode: 'new' })} icon={<Plus aria-hidden className="size-4" />}>
                  Record production
                </Button>
              ) : (
                <Link className="text-[13px] font-medium text-info hover:underline" to="/jobs">
                  Go to job orders
                </Link>
              )
            }
          />
        ) : (
          <DataTable
            caption="Production entries"
            columns={columns}
            rows={rows ?? []}
            loading={rows === undefined}
            rowKey={(r) => r.entry.id}
            onRowClick={(r) => setPanel({ mode: 'view', id: r.entry.id })}
            empty={{ title: 'Nothing recorded in this period', description: 'Choose a longer period, or record production.' }}
          />
        )}
      </Card>

      <Panel
        open={panel !== null}
        title={panel?.mode === 'new' ? 'Record production' : 'Production entry'}
        onClose={() => setPanel(null)}
        footer={
          panel?.mode === 'new' ? (
            <>
              <Button type="submit" form="production-form">
                Save entry
              </Button>
              <Button variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </>
          ) : undefined
        }
      >
        {panel?.mode === 'new' && views && employees ? (
          <ProductionForm
            key={`${panel.jobId ?? ''}-${panel.stageId ?? ''}`}
            jobs={recordable}
            employees={employees ?? []}
            initialJobId={panel.jobId}
            initialStageId={panel.stageId}
            onSaved={() => setPanel(null)}
          />
        ) : null}
        {panel?.mode === 'view' && current ? <EntryDetail row={current} canVoid={canVoid} onDone={() => setPanel(null)} /> : null}
      </Panel>
    </div>
  );
}

// -----------------------------------------------------------------------------
export function ProductionForm({
  jobs,
  employees,
  initialJobId,
  initialStageId,
  onSaved,
}: {
  jobs: JobView[];
  employees: EmployeeRecord[];
  initialJobId?: string;
  initialStageId?: string;
  onSaved: () => void;
}) {
  const { db } = useLocalData();
  const firstJob = jobs.find((j) => j.job.id === initialJobId) ?? (jobs.length === 1 ? jobs[0] : undefined);
  const [jobId, setJobId] = useState(firstJob?.job.id ?? '');
  const job = jobs.find((j) => j.job.id === jobId);
  const defaultStage = (view: JobView | undefined) =>
    view?.stages.find((s) => s.id === initialStageId)?.id ??
    view?.stages.find((s) => s.status === 'in_progress')?.id ??
    view?.stages.find((s) => s.status === 'not_started')?.id ??
    '';
  const [stageId, setStageId] = useState(defaultStage(firstJob));
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [good, setGood] = useState('');
  const [rejected, setRejected] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-ink-700">
        No job is ready for production. Approve a job in <Link className="text-info hover:underline" to="/jobs">Job orders</Link> first.
      </p>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setField(null);
    if (!jobId || !stageId) {
      setError('Choose the job and the stage.');
      return;
    }
    try {
      await recordProduction(db, {
        jobId,
        stageId,
        employeeId: employeeId || null,
        date,
        good: good === '' ? 0 : Number(good),
        rejected: rejected === '' ? 0 : Number(rejected),
        reason,
        notes,
      });
      onSaved();
    } catch (err) {
      if (err instanceof ValidationError) {
        setField(err.field);
        setError(err.message);
      } else setError('Could not save the entry. Try again.');
    }
  }

  const hasRejects = Number(rejected) > 0;
  const unit = job?.job.unit ?? '';

  return (
    <form id="production-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <FormError message={error} />
      <Select
        label="Job"
        required
        value={jobId}
        placeholder="Choose a job"
        options={jobs.map((v) => ({ value: v.job.id, label: jobLabel(v) }))}
        onChange={(e) => {
          setJobId(e.target.value);
          setStageId(defaultStage(jobs.find((j) => j.job.id === e.target.value)));
        }}
      />
      <Select
        label="Stage"
        required
        value={stageId}
        placeholder="Choose a stage"
        disabled={!job}
        options={(job?.stages ?? []).filter((s) => s.status !== 'skipped').map((s) => ({ value: s.id, label: s.name }))}
        onChange={(e) => setStageId(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={`Good${unit ? ` (${unit})` : ''}`}
          inputMode="decimal"
          value={good}
          error={field === 'good' ? ' ' : undefined}
          onChange={(e) => setGood(e.target.value)}
        />
        <Input label={`Rejected${unit ? ` (${unit})` : ''}`} inputMode="decimal" value={rejected} onChange={(e) => setRejected(e.target.value)} />
      </div>
      {hasRejects ? (
        <Input
          label="Reason for rejection"
          required
          placeholder="For example: ink smudge, wrong size"
          value={reason}
          error={field === 'reason' ? ' ' : undefined}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <Select
          label="Worker"
          value={employeeId}
          placeholder="Not set"
          options={employees.map((e) => ({ value: e.id, label: e.name }))}
          onChange={(e) => setEmployeeId(e.target.value)}
        />
      </div>
      <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <p className="text-[12px] text-ink-500">Entries are never edited. If you make a mistake, a manager voids the entry and you record it again.</p>
    </form>
  );
}

// -----------------------------------------------------------------------------
function EntryDetail({ row, canVoid, onDone }: { row: Row; canVoid: boolean; onDone: () => void }) {
  const { db } = useLocalData();
  const { entry, view, stageName, employee } = row;
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unrecorded = entry._sync === 'rejected' || entry._sync === 'conflict';

  async function doVoid() {
    setError(null);
    try {
      await voidProduction(db, entry.id, reason);
      setVoiding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void the entry.');
    }
  }

  return (
    <div className="flex flex-col gap-4 text-[13px]">
      {unrecorded ? (
        <div role="alert" className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 p-3">
          <p className="font-medium">Not recorded: {entry._message ?? 'the server refused this entry.'}</p>
          <p className="mt-1 text-ink-700">These numbers are only on this device. Remove the entry once you have noted them.</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => void discardUnrecordedEntry(db, entry.id).then(onDone)}
          >
            Remove from this device
          </Button>
        </div>
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Job" value={view ? jobLabel(view) : '-'} />
        <Fact label="Stage" value={stageName} />
        <Fact label="Good" value={`${formatNumber(Number(entry.good_qty))} ${view?.job.unit ?? ''}`} />
        <Fact label="Rejected" value={`${formatNumber(Number(entry.rejected_qty))} ${view?.job.unit ?? ''}`} />
        <Fact label="Date" value={localDate(entry.entry_date)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? '-'} />
        <Fact label="Worker" value={employee ?? 'Not set'} />
      </dl>
      {entry.rejection_reason ? <Fact label="Reason for rejection" value={entry.rejection_reason} /> : null}
      {entry.notes ? <Fact label="Notes" value={entry.notes} /> : null}
      {entry.recorded_by_name ? <p className="text-ink-500">Recorded by {entry.recorded_by_name}</p> : null}
      {entry.voided_at ? (
        <p className="rounded-[var(--radius-control)] bg-sunken p-3">
          Voided{entry.voided_by_name ? ` by ${entry.voided_by_name}` : ''}: {entry.void_reason}. It no longer counts in totals.
        </p>
      ) : null}
      {canVoid && !entry.voided_at && !unrecorded ? (
        voiding ? (
          <div className="flex flex-col gap-2">
            <Input label="Reason for voiding" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <FormError message={error} />
            <div className="flex gap-2">
              <Button size="sm" variant="danger" onClick={() => void doVoid()}>
                Void entry
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setVoiding(false)}>
                Back
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="secondary" className="self-start" onClick={() => setVoiding(true)}>
            Void this entry
          </Button>
        )
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
