import { useCallback, useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { messageOf, type PlatformStats } from '../../auth/types';
import { formatRupees, planByCode } from '../../domain/plans';
import { formatNumber, formatRelativeTime } from '../../lib/format';

/** JobFlow-wide numbers for the owner (RK Digitals). The server refuses anyone else. */
export function OwnerStatsPage() {
  const { backend, status } = useAuth();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!backend) return;
    setLoading(true);
    setError(null);
    try {
      setStats(await backend.platformStats());
    } catch (err) {
      setStats(null);
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  useEffect(() => {
    if (status === 'signed_in') void load();
  }, [status, load]);

  if (status !== 'signed_in' || (error && !stats)) {
    return (
      <Card>
        <EmptyState
          icon={<Lock aria-hidden className="size-5" />}
          title="Owner statistics are private"
          description={error && status === 'signed_in' ? error : 'Only the JobFlow owner can see this page.'}
        />
      </Card>
    );
  }

  const tiles: { label: string; value: string; note?: string }[] = stats
    ? [
        { label: 'Sign-ups', value: formatNumber(stats.signUps), note: `${formatNumber(stats.signUpsLast7Days)} in the last 7 days` },
        { label: 'Active people', value: formatNumber(stats.activeLast7Days), note: `last 7 days (${formatNumber(stats.activeLast30Days)} in 30 days)` },
        { label: 'Businesses', value: formatNumber(stats.businesses), note: `${formatNumber(stats.onTrial)} on trial` },
        { label: 'Paying', value: formatNumber(stats.paying), note: Object.entries(stats.payingByPlan).map(([p, n]) => `${planByCode(p)?.name ?? p} ${n}`).join(', ') || 'none yet' },
        { label: 'Monthly revenue', value: formatRupees(stats.monthlyRevenuePaise), note: 'from active plans' },
        { label: 'Trials ending', value: formatNumber(stats.trialsEndingIn7Days), note: 'in the next 7 days' },
        { label: 'Jobs', value: formatNumber(stats.jobs), note: `${formatNumber(stats.jobsLast7Days)} created in 7 days` },
        { label: 'Production entries', value: formatNumber(stats.productionEntriesLast7Days), note: 'last 7 days' },
      ]
    : [];
  const maxWeek = Math.max(1, ...(stats?.signUpsByWeek ?? []).map((w) => w.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-500">
          Across every business on JobFlow. Counts only: you never see customers&apos; jobs.
          {stats ? ` Updated ${formatRelativeTime(new Date(stats.generatedAt))}.` : ''}
        </p>
        <Button size="sm" variant="secondary" loading={loading} onClick={() => void load()} icon={<RefreshCw aria-hidden className="size-3.5" />}>
          Refresh
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <dt className="text-[12px] text-ink-500">{t.label}</dt>
            <dd className="tabular mt-1 text-[22px] font-semibold">{t.value}</dd>
            {t.note ? <dd className="text-[12px] text-ink-500">{t.note}</dd> : null}
          </div>
        ))}
      </dl>

      {stats ? (
        <Card>
          <CardHeader title="Sign-ups per week" description="Last 8 weeks" />
          <ol className="flex h-28 items-end gap-2" aria-label="Sign-ups per week">
            {stats.signUpsByWeek.map((w) => (
              <li key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
                <span className="tabular text-[11px] text-ink-500">{w.count}</span>
                <span className="w-full rounded-t-[4px] bg-info" style={{ height: `${Math.max(2, (w.count / maxWeek) * 80)}px` }} />
                <span className="text-[10px] text-ink-500">
                  {new Date(w.weekStart).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {stats ? (
        <Card>
          <CardHeader title="Businesses" description="Newest first" />
          {stats.recentBusinesses.length === 0 ? <p className="text-[13px] text-ink-500">No businesses yet.</p> : null}
          <ul className="flex flex-col divide-y divide-line">
            {stats.recentBusinesses.map((b) => {
              const trialEnds = new Date(b.trialEndsAt);
              return (
                <li key={`${b.name}-${b.createdAt}`} className="flex flex-wrap items-start justify-between gap-2 py-3 text-[13px]">
                  <div className="min-w-0">
                    <p className="font-medium">{b.name}</p>
                    <p className="text-[12px] text-ink-500">
                      {b.members} {b.members === 1 ? 'person' : 'people'}, {b.jobs} {b.jobs === 1 ? 'job' : 'jobs'}, active{' '}
                      {formatRelativeTime(new Date(b.lastActivityAt))}
                    </p>
                  </div>
                  <span className="flex flex-col items-end gap-1">
                    {b.status === 'active' ? (
                      <Badge tone="good">{planByCode(b.plan)?.name ?? b.plan}</Badge>
                    ) : !b.canWrite ? (
                      <Badge tone="critical">Read-only</Badge>
                    ) : b.status === 'trialing' && trialEnds > new Date() ? (
                      <Badge tone="info">Trial to {trialEnds.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Badge>
                    ) : (
                      <Badge tone="warning">Trial ended</Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
