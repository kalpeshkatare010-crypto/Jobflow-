import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, TriangleAlert } from 'lucide-react';
import { Badge, Button, Input, JOB_STATUS_LABEL } from '../../components/ui';
import { SyncBadge } from '../../components/SyncBadge';
import { FormError } from '../../auth/AuthLayout';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalData } from '../../offline/LocalDataProvider';
import type { JobEventRecord, JobStageRecord } from '../../offline/db';
import { dismissConflict, moveJob, stageStep } from '../../offline/jobs';
import { ValidationError } from '../../offline/customers';
import { STAGE_ACTIONS, STAGE_ACTION_LABEL, statusActions, type StatusAction } from '../../domain/jobStatus';
import { describeDue, formatQuantity, formatRelativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';
import { localDate, PRIORITY_LABEL, stageTotals, toSummary, useJobEvents, type JobView } from './jobData';
import { useNavigate } from 'react-router';
import { formatNumber } from '../../lib/format';

const STAGE_STATUS_LABEL: Record<JobStageRecord['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  skipped: 'Skipped',
};

const STAGE_TONE = { not_started: 'neutral', in_progress: 'info', done: 'good', skipped: 'neutral' } as const;

function errorText(err: unknown): string {
  return err instanceof ValidationError || err instanceof Error ? err.message : 'Something went wrong. Try again.';
}

function describeEvent(e: JobEventRecord): string {
  switch (e.kind) {
    case 'created':
      return 'Job created';
    case 'edited':
      return 'Details edited';
    case 'status': {
      const to = e.to_status ? (JOB_STATUS_LABEL[e.to_status as keyof typeof JOB_STATUS_LABEL] ?? e.to_status) : '';
      return `Moved to ${to}${e.reason ? ` - ${e.reason}` : ''}`;
    }
    case 'stage': {
      const verb = { start: 'started', complete: 'finished', skip: 'skipped', reopen: 'reopened' }[e.stage_action ?? ''] ?? 'updated';
      return `${e.stage_name ?? 'Stage'} ${verb}`;
    }
  }
}

export function JobDetail({ view, canManage, onEdit }: { view: JobView; canManage: boolean; onEdit: () => void }) {
  const { db, localOnly } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  const isAdmin = status === 'demo' || activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'admin';
  const { job, customer, stages } = view;

  const events = useJobEvents(db, job.id);
  const conflicts = useLiveQuery(() => db.conflicts.where('entityId').equals(job.id).toArray(), [db, job.id]);
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stagesOpen = job.status === 'approved' || job.status === 'in_production';
  const canRecord = stagesOpen || job.status === 'on_hold';
  const navigate = useNavigate();
  const perStage = stageTotals(view);
  const summary = toSummary(view);
  const due = localDate(job.due_date);

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  async function choose(action: StatusAction) {
    if (action.reason) {
      setPendingAction(action);
      setReason('');
      return;
    }
    await run(() => moveJob(db, job.id, action.to));
  }

  async function confirmMove() {
    if (!pendingAction) return;
    const ok = await run(() => moveJob(db, job.id, pendingAction.to, reason));
    if (ok) setPendingAction(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <SyncBadge mark={job._sync} localOnly={localOnly} />
        {job.priority !== 'normal' ? <Badge tone={job.priority === 'urgent' ? 'critical' : job.priority === 'high' ? 'warning' : 'neutral'}>{PRIORITY_LABEL[job.priority]} priority</Badge> : null}
      </div>

      {conflicts && conflicts.length > 0 ? (
        <div role="alert" className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 p-3 text-[13px]">
          {conflicts.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <p className="flex items-start gap-2 font-medium">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {c.message ?? `Someone else changed ${c.fields.join(', ') || 'this job'} first. The other change was kept.`}
              </p>
              <Button size="sm" variant="secondary" className="self-start" onClick={() => void dismissConflict(db, c.id)}>
                OK, got it
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <section>
        <h3 className="text-[15px] font-semibold">{job.title}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <Fact label="Customer" value={customer?.name ?? 'Unknown customer'} />
          <Fact label="Quantity" value={formatQuantity(job.quantity, job.unit)} />
          <Fact label="Finished output" value={`${formatNumber(summary.producedQty)} of ${formatQuantity(job.quantity, job.unit)}`} />
          <Fact label="Rejected" value={formatQuantity(summary.rejectedQty, job.unit)} />
          <Fact label="Due" value={due ? describeDue(due) : 'No due date'} />
          <Fact label="Ordered" value={localDate(job.order_date)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? '-'} />
        </dl>
        {job.product_description ? <Text label="Product" value={job.product_description} /> : null}
        {job.instructions ? <Text label="Instructions" value={job.instructions} /> : null}
        {job.notes ? <Text label="Notes" value={job.notes} /> : null}
        {canManage && !['delivered', 'cancelled'].includes(job.status) ? (
          <Button size="sm" variant="secondary" className="mt-3" onClick={onEdit} icon={<Pencil aria-hidden className="size-3.5" />}>
            Edit details
          </Button>
        ) : null}
      </section>

      <section aria-labelledby="stages-h">
        <h3 id="stages-h" className="text-[13px] font-semibold text-ink-700">
          Stages
        </h3>
        {!stagesOpen && ['draft', 'on_hold'].includes(job.status) ? (
          <p className="mt-1 text-[12px] text-ink-500">{job.status === 'draft' ? 'Approve the job to start work on its stages.' : 'Resume the job to continue work.'}</p>
        ) : null}
        <ol className="mt-2 flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
          {stages.map((stage, i) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5">
              <span className="tabular w-5 text-[12px] text-ink-400">{i + 1}</span>
              <span className={cn('min-w-0 flex-1 text-[13px] font-medium', stage.status === 'skipped' && 'text-ink-400 line-through')}>
                {stage.name}
                {stage.counts_output ? <span className="ml-1.5 text-[11px] font-normal text-ink-500">(counts output)</span> : null}
                <StageNumbers totals={perStage.get(stage.id)} />
              </span>
              <Badge tone={STAGE_TONE[stage.status]}>{STAGE_STATUS_LABEL[stage.status]}</Badge>
              {stagesOpen || canRecord ? (
                <span className="flex w-full justify-end gap-1 sm:w-auto">
                  {canRecord && stage.status !== 'skipped' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate(`/production?job=${job.id}&stage=${stage.id}`)}
                      aria-label={`Record production for ${stage.name}`}
                    >
                      Record
                    </Button>
                  ) : null}
                  {(stagesOpen ? STAGE_ACTIONS[stage.status] : []).map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={action === 'complete' || action === 'start' ? 'primary' : 'secondary'}
                      onClick={() => void run(() => stageStep(db, job.id, stage.id, action))}
                      aria-label={`${STAGE_ACTION_LABEL[action]} ${stage.name}`}
                    >
                      {STAGE_ACTION_LABEL[action]}
                    </Button>
                  ))}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {canManage ? (
        <section aria-labelledby="status-h">
          <h3 id="status-h" className="text-[13px] font-semibold text-ink-700">
            Job status
          </h3>
          {pendingAction ? (
            <div className="mt-2 flex flex-col gap-2">
              <Input
                label={pendingAction.reason === 'required' ? 'Reason (required)' : 'Reason (optional)'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" variant={pendingAction.tone === 'danger' ? 'danger' : 'primary'} onClick={() => void confirmMove()}>
                  {pendingAction.label}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPendingAction(null)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {statusActions(job.status, job.held_from, isAdmin).map((action) => (
                <Button key={action.to} size="sm" variant={action.tone} onClick={() => void choose(action)}>
                  {action.label}
                </Button>
              ))}
              {job.status === 'delivered' ? <p className="text-[13px] text-ink-500">This job is delivered and closed.</p> : null}
            </div>
          )}
        </section>
      ) : null}

      {error ? <FormError message={error} /> : null}

      <section aria-labelledby="history-h">
        <h3 id="history-h" className="text-[13px] font-semibold text-ink-700">
          History
        </h3>
        <ul className="mt-2 flex flex-col gap-2">
          {(events ?? []).map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0">
                {describeEvent(e)}
                {e.actor_name ? <span className="text-ink-500"> by {e.actor_name}</span> : null}
                {e._local ? <span className="text-ink-500"> (on this device)</span> : null}
              </span>
              <time dateTime={e.created_at} className="shrink-0 text-[12px] text-ink-500">
                {formatRelativeTime(new Date(e.created_at))}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StageNumbers({ totals }: { totals: { good: number; rejected: number } | undefined }) {
  if (!totals || (totals.good === 0 && totals.rejected === 0)) return null;
  return (
    <span className="block text-[12px] font-normal text-ink-500">
      {formatNumber(totals.good)} good
      {totals.rejected > 0 ? <span className="text-critical">, {formatNumber(totals.rejected)} rejected</span> : null}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-500">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function Text({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 text-[13px]">
      <p className="text-[12px] text-ink-500">{label}</p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}
