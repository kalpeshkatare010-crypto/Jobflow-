import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Lock } from 'lucide-react';
import { Button, Card, EmptyState, Input } from '../../components/ui';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalData } from '../../offline/LocalDataProvider';
import { useJobViews } from '../jobs/jobData';
import { useMaterialViews } from '../inventory/InventoryPage';
import { jobsReport, productionReport, rejectionReport, stockReport, type Period, type Report } from '../../domain/reports';
import { csvFileName, toCsv, type Cell } from '../../domain/csv';
import { todayIso } from '../../domain/production';
import { saveCsv } from '../../app/download';
import { formatNumber } from '../../lib/format';
import { cn } from '../../lib/cn';

const TABS = [
  { value: 'jobs', label: 'Jobs' },
  { value: 'production', label: 'Production' },
  { value: 'rejections', label: 'Rejections' },
  { value: 'stock', label: 'Stock' },
] as const;
type Tab = (typeof TABS)[number]['value'];

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return todayIso(d);
}

const PRESETS = [
  { label: '7 days', from: () => daysAgo(6) },
  { label: '30 days', from: () => daysAgo(29) },
  { label: 'This month', from: () => todayIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) },
  { label: '1 year', from: () => daysAgo(365) },
];

const PREVIEW_ROWS = 100;

function show(cell: Cell): string {
  if (typeof cell === 'number') return formatNumber(cell);
  if (cell instanceof Date) return cell.toLocaleDateString('en-IN');
  return cell === null || cell === undefined ? '' : String(cell);
}

export function ReportsPage() {
  const { db } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  // Reports are for production managers and above (permission reports.view).
  const allowed = status === 'demo' || (activeWorkspace !== null && activeWorkspace.role !== 'employee');
  const views = useJobViews(db);
  const materials = useMaterialViews();
  const employees = useLiveQuery(() => db.employees.toArray(), [db]);
  const [tab, setTab] = useState<Tab>('jobs');
  const [period, setPeriod] = useState<Period>({ from: daysAgo(29), to: todayIso() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const report: Report | null = useMemo(() => {
    if (!views || !materials || !employees) return null;
    const p = period.from <= period.to ? period : { from: period.to, to: period.from };
    if (tab === 'jobs') return jobsReport(views, p, new Date());
    if (tab === 'production') return productionReport(views, employees, p);
    if (tab === 'rejections') return rejectionReport(views, p);
    return stockReport(materials, p);
  }, [tab, period, views, materials, employees]);

  if (!allowed) {
    return (
      <Card>
        <EmptyState
          icon={<Lock aria-hidden className="size-5" />}
          title="Reports are for managers"
          description="Ask the owner or a production manager for the reports you need."
        />
      </Card>
    );
  }

  async function download() {
    if (!report) return;
    setError(null);
    setSaving(true);
    try {
      await saveCsv(csvFileName(report.title, period.from, period.to), toCsv(report.headers, report.rows));
    } catch {
      setError('The file could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Report" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'press h-8 shrink-0 rounded-full px-3 text-[13px] font-medium',
              tab === t.value ? 'bg-ink-900 text-on-ink' : 'bg-surface text-ink-700 hover:bg-sunken',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-[360px]">
            <Input label="From" type="date" value={period.from} max={period.to} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value }))} />
            <Input label="To" type="date" value={period.to} max={todayIso()} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <Button key={preset.label} size="sm" variant="secondary" onClick={() => setPeriod({ from: preset.from(), to: todayIso() })}>
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
        {tab === 'jobs' ? <p className="mt-3 text-[12px] text-ink-500">Jobs whose order date falls in the period.</p> : null}
        {tab === 'stock' ? <p className="mt-3 text-[12px] text-ink-500">Stock on hand is as of now; received, issued and adjusted are for the period.</p> : null}
      </Card>

      {report ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {report.totals.map((t) => (
              <div key={t.label} className="min-w-0 rounded-[var(--radius-card)] bg-surface p-4">
                <dt className="text-[12px] text-ink-500">{t.label}</dt>
                <dd
                  className={cn(
                    'tabular mt-1 font-semibold break-words',
                    typeof t.value === 'number' || t.value.length <= 8 ? 'text-[20px]' : 'text-[15px] leading-snug',
                  )}
                >
                  {typeof t.value === 'number' ? formatNumber(t.value) : t.value}
                </dd>
              </div>
            ))}
          </dl>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">
                {report.title} report <span className="font-normal text-ink-500">({formatNumber(report.rows.length)} rows)</span>
              </h2>
              <Button onClick={() => void download()} loading={saving} disabled={report.rows.length === 0} icon={<Download aria-hidden className="size-4" />}>
                Download CSV
              </Button>
            </div>
            {error ? (
              <p role="alert" className="mb-2 text-[13px] text-critical">
                {error}
              </p>
            ) : null}
            {report.rows.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-500">Nothing in this period. Choose a longer period.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <table className="w-full border-collapse text-[13px]">
                  <caption className="sr-only">{report.title} report</caption>
                  <thead>
                    <tr className="border-b border-line">
                      {report.headers.map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 text-left text-[12px] font-medium whitespace-nowrap text-ink-500 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            className={cn(
                              'px-3 py-2 whitespace-nowrap first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6',
                              typeof cell === 'number' && 'tabular text-right',
                            )}
                          >
                            {show(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report.rows.length > PREVIEW_ROWS ? (
              <p className="mt-3 text-[12px] text-ink-500">
                Showing the first {PREVIEW_ROWS} rows. The CSV has all {formatNumber(report.rows.length)}.
              </p>
            ) : null}
          </Card>
          <p className="text-[12px] text-ink-500">
            Reports use the data on this device. When the sync icon says everything is synced, they include your whole team&apos;s work.
          </p>
        </>
      ) : null}
    </div>
  );
}
