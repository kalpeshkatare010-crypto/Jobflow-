import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Dexie from 'dexie';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { csvCell, csvFileName, toCsv } from '../../src/domain/csv';
import { jobsReport, productionReport, rejectionReport } from '../../src/domain/reports';
import { todayIso } from '../../src/domain/production';
import { JobFlowDB } from '../../src/offline/db';
import { createCustomer } from '../../src/offline/customers';
import { saveWorkflow } from '../../src/offline/workflows';
import { createJob } from '../../src/offline/jobs';
import { recordProduction, voidProduction } from '../../src/offline/production';
import type { JobView } from '../../src/features/jobs/jobData';

beforeEach(async () => {
  await Dexie.delete('jobflow_demo_device');
});

describe('CSV', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Deccan Pumps, Satpur')).toBe('"Deccan Pumps, Satpur"');
    expect(csvCell('5" pipe')).toBe('"5"" pipe"');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('Yes');
  });

  it('stops spreadsheet formulas hidden in names', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe('"\'=HYPERLINK(""http://x"",""click"")"');
    expect(csvCell('+91 98')).toBe("'+91 98");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe('-5');
  });

  it('starts with a UTF-8 mark and uses Excel line endings', () => {
    const csv = toCsv(['Name', 'Qty'], [['पुणे', 3]]);
    expect(csv.startsWith('﻿Name,Qty\r\n')).toBe(true);
    expect(csv).toContain('पुणे,3\r\n');
    expect(csvFileName('Rejections', '2026-11-01', '2026-11-21')).toBe('jobflow-rejections-2026-11-01-to-2026-11-21.csv');
  });
});

async function seedViews(): Promise<{ db: JobFlowDB; views: () => Promise<JobView[]> }> {
  const db = new JobFlowDB('jobflow_demo_device');
  const customerId = await createCustomer(db, 'demo', { name: 'Godavari Foods' });
  const workflowId = await saveWorkflow(db, 'demo', { name: 'Cartons', stages: [{ name: 'Printing' }, { name: 'Packing' }] });
  const jobId = await createJob(db, 'demo', { customer_id: customerId, workflow_id: workflowId, title: 'Carton boxes', quantity: 1000, unit: 'pcs', status: 'approved' });
  const stages = await db.jobStages.where('job_id').equals(jobId).sortBy('position');
  await recordProduction(db, { jobId, stageId: stages[0]!.id, employeeId: null, date: todayIso(), good: 900, rejected: 60, reason: 'Misprint' });
  await recordProduction(db, { jobId, stageId: stages[1]!.id, employeeId: null, date: todayIso(), good: 800, rejected: 40, reason: 'Crushed' });
  const wrong = await recordProduction(db, { jobId, stageId: stages[1]!.id, employeeId: null, date: todayIso(), good: 5000, rejected: 0 });
  await voidProduction(db, wrong, 'Typed an extra zero');
  const views = async () => {
    const job = (await db.jobOrders.get(jobId))!;
    return [{ job, customer: await db.customers.get(customerId), stages: await db.jobStages.where('job_id').equals(jobId).sortBy('position'), entries: await db.productionEntries.toArray() }];
  };
  return { db, views };
}

describe('report figures', () => {
  it('count only valid output, list voided entries as voided, and rank rejection reasons', async () => {
    const { db, views } = await seedViews();
    const period = { from: todayIso(), to: todayIso() };
    const v = await views();

    const jobs = jobsReport(v, period, new Date());
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]![9]).toBe(800); // finished output = Packing good, voided entry excluded
    expect(jobs.rows[0]![10]).toBe(100);

    const prod = productionReport(v, [], period);
    expect(prod.rows).toHaveLength(3);
    expect(prod.rows.some((r) => String(r[10]).startsWith('Voided: Typed an extra zero'))).toBe(true);
    expect(prod.totals.find((t) => t.label === 'Good')?.value).toBe(1700);

    const rej = rejectionReport(v, period);
    expect(rej.rows[0]!.slice(0, 3)).toEqual(['Printing', 'Misprint', 60]);
    expect(rej.rows[0]![3]).toBe('60%');
    expect(rej.totals.find((t) => t.label === 'Rejection rate')?.value).toBe('5.6%');
    db.close();
  });
});

describe('Reports screen', () => {
  it('shows the reports and downloads a CSV', async () => {
    const { db } = await seedViews();
    db.close();
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      created.push(blob as Blob);
      return 'blob:report';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(
      <AuthProvider backend={null}>
        <MemoryRouter initialEntries={['/reports']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Jobs report' });
    expect(within(table).getByText('Carton boxes')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Rejections' }));
    const rejections = await screen.findByRole('table', { name: 'Rejections report' });
    expect(within(rejections).getByText('Misprint')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const text = await created[0]!.text();
    expect(text).toContain('Stage,Reason,Rejected');
    expect(text).toContain('Printing,Misprint,60');
    vi.restoreAllMocks();
  });
});
