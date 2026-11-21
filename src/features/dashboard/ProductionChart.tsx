import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { formatNumber, formatPercent } from '../../lib/format';
import { rejectionRate } from '../../domain/jobs';
import { useTheme } from '../../app/theme';

export interface WeeklyOutput {
  week: string;
  good: number;
  rejected: number;
}

// Hex values, not CSS variables: SVG fill attributes do not resolve var().
// Keep in sync with --color-series-1/2 in styles/index.css (both themes validated).
const PALETTE = {
  light: { good: '#3b5bdb', rejected: '#c2621a', grid: '#e7e7e5', tick: '#6b6b6b', surface: '#ffffff' },
  dark: { good: '#6a8bf0', rejected: '#d27a3a', grid: '#222222', tick: '#8c8c8c', surface: '#111111' },
};

const SERIES = [
  { key: 'good', label: 'Good output', color: 'var(--color-series-1)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--color-series-2)' },
] as const;

function ChartTooltip({ active, payload, label }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as WeeklyOutput | undefined;
  if (!row) return null;
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5 text-[13px] shadow-[var(--shadow-pop)] ring-1 ring-line">
      <p className="mb-1.5 font-medium text-ink-900">Week of {label}</p>
      {SERIES.map((series) => (
        <p key={series.key} className="flex items-center justify-between gap-6 text-ink-700">
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: series.color }} />
            {series.label}
          </span>
          <span className="tabular font-medium text-ink-900">{formatNumber(row[series.key])} pcs</span>
        </p>
      ))}
      <p className="mt-1.5 border-t border-line pt-1.5 text-ink-500">
        Rejection rate {formatPercent(rejectionRate(row.good, row.rejected))}
      </p>
    </div>
  );
}

function compact(value: number) {
  return value >= 1000 ? `${formatNumber(value / 1000, 'en-IN', 1)}k` : String(value);
}

export function ProductionChart({ data }: { data: WeeklyOutput[] }) {
  const colors = PALETTE[useTheme().resolved];
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-[13px] text-ink-700" aria-label="Legend">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
      </ul>
      <div className="h-[240px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: -12 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tick={{ fill: colors.tick, fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: colors.tick, fontSize: 12 }}
              tickFormatter={compact}
              width={48}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(20 33 61 / 0.04)' }} />
            <Bar animationDuration={700} animationEasing="ease-out" dataKey="good" stackId="output" fill={colors.good} stroke={colors.surface} strokeWidth={2} />
            <Bar
              animationDuration={700}
              animationEasing="ease-out"
              dataKey="rejected"
              stackId="output"
              fill={colors.rejected}
              stroke={colors.surface}
              strokeWidth={2}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* The same numbers as a table for screen readers */}
      <table className="sr-only">
        <caption>Good output and rejected pieces per week</caption>
        <thead>
          <tr>
            <th scope="col">Week of</th>
            <th scope="col">Good output</th>
            <th scope="col">Rejected</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.week}>
              <th scope="row">{row.week}</th>
              <td>{formatNumber(row.good)}</td>
              <td>{formatNumber(row.rejected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
