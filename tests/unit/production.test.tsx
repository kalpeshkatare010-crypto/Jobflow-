import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Dexie from 'dexie';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { JobFlowDB, type ProductionEntryRecord } from '../../src/offline/db';
import { discardUnrecordedEntry, recordProduction, totals, validateProduction, voidProduction } from '../../src/offline/production';
import { rejectionShare, todayIso, weeklyOutput } from '../../src/domain/production';
import { createJob, moveJob } from '../../src/offline/jobs';
import { createCustomer } from '../../src/offline/customers';
import { saveWorkflow } from '../../src/offline/workflows';

beforeEach(async () => {
  await Dexie.delete('jobflow_demo_device');
  await Dexie.delete('prod-test');
});

function entry(partial: Partial<ProductionEntryRecord>): ProductionEntryRecord {
  return {
    id: 'e',
    tenant_id: 't',
    job_id: 'j',
    job_stage_id: 's',
    employee_id: null,
    entry_date: todayIso(),
    good_qty: 0,
    rejected_qty: 0,
    rejection_reason: null,
    notes: null,
    recorded_by_name: null,
    voided_at: null,
    void_reason: null,
    voided_by_name: null,
    version: 1,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    _sync: 'synced',
    ...partial,
  };
}

describe('production rules', () => {
  it('match the server: something produced, a reason for rejects, a date within a year', () => {
    const base = { jobId: 'j', stageId: 's', employeeId: null, date: todayIso(), good: 10, rejected: 0 };
    expect(() => validateProduction(base)).not.toThrow();
    expect(() => validateProduction({ ...base, good: 0 })).toThrow('above zero');
    expect(() => validateProduction({ ...base, good: -1 })).toThrow('zero or more');
    expect(() => validateProduction({ ...base, rejected: 2 })).toThrow('reason');
    expect(() => validateProduction({ ...base, rejected: 2, reason: 'Torn' })).not.toThrow();
    expect(() => validateProduction({ ...base, date: '2020-01-01' })).toThrow('last year');
  });

  it('totals skip voided entries and entries the server did not record', () => {
    expect(
      totals([
        entry({ good_qty: 10, rejected_qty: 1 }),
        entry({ good_qty: 5, voided_at: 'x' }),
        entry({ good_qty: 7, _sync: 'rejected' }),
        entry({ good_qty: 3, _sync: 'conflict' }),
        entry({ good_qty: 2, _sync: 'pending' }),
      ]),
    ).toEqual({ good: 12, rejected: 1 });
    expect(rejectionShare(90, 10)).toBeCloseTo(0.1);
    expect(rejectionShare(0, 0)).toBe(0);
  });

  it('weekly output counts finished good only on output stages, rejects on all', () => {
    const today = new Date(2026, 10, 21);
    const weeks = weeklyOutput(
      [
        entry({ job_stage_id: 'out', good_qty: 100, rejected_qty: 4, entry_date: '2026-11-21' }),
        entry({ job_stage_id: 'cut', good_qty: 500, rejected_qty: 6, entry_date: '2026-11-20' }),
        entry({ job_stage_id: 'out', good_qty: 50, entry_date: '2026-11-10' }),
        entry({ job_stage_id: 'out', good_qty: 999, entry_date: '2026-11-21', voided_at: 'x' }),
      ],
      new Set(['out']),
      today,
    );
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toMatchObject({ good: 100, rejected: 10 });
    expect(weeks[6]).toMatchObject({ good: 50, rejected: 0 });
  });
});

describe('recording offline', () => {
  it('saves and queues in one step, starts the stage, and voids without deleting', async () => {
    const db = new JobFlowDB('prod-test');
    const customerId = await createCustomer(db, 't1', { name: 'Godavari Foods' });
    const workflowId = await saveWorkflow(db, 't1', { name: 'Cartons', stages: [{ name: 'Printing' }, { name: 'Packing' }] });
    const jobId = await createJob(db, 't1', { customer_id: customerId, workflow_id: workflowId, title: 'Cartons', quantity: 1000, unit: 'pcs', status: 'approved' });
    const [first] = (await db.jobStages.where('job_id').equals(jobId).sortBy('position'));

    const id = await recordProduction(db, { jobId, stageId: first!.id, employeeId: null, date: todayIso(), good: 480, rejected: 20, reason: 'Ink smudge' });
    const saved = await db.productionEntries.get(id);
    expect(saved).toMatchObject({ good_qty: 480, rejected_qty: 20, rejection_reason: 'Ink smudge', _sync: 'pending' });
    expect((await db.outbox.where('entityId').equals(id).first())?.type).toBe('production.record');
    expect((await db.jobStages.get(first!.id))?.status).toBe('in_progress');
    expect((await db.jobOrders.get(jobId))?.status).toBe('in_production');

    await expect(voidProduction(db, id, 'x')).rejects.toThrow('reason');
    await voidProduction(db, id, 'Counted twice');
    expect(await db.productionEntries.get(id)).toMatchObject({ good_qty: 480, void_reason: 'Counted twice' });

    // Only entries the server refused can be removed from the device.
    await discardUnrecordedEntry(db, id);
    expect(await db.productionEntries.get(id)).toBeDefined();
    await db.productionEntries.update(id, { _sync: 'conflict' });
    await discardUnrecordedEntry(db, id);
    expect(await db.productionEntries.get(id)).toBeUndefined();

    await moveJob(db, jobId, 'cancelled', 'Customer cancelled');
    await expect(recordProduction(db, { jobId, stageId: first!.id, employeeId: null, date: todayIso(), good: 1, rejected: 0 })).rejects.toThrow('cancelled');
    db.close();
  });
});

describe('Production screen', () => {
  it('records from a job stage, shows totals on the job, and feeds the dashboard', async () => {
    const seed = new JobFlowDB('jobflow_demo_device');
    const customerId = await createCustomer(seed, 'demo', { name: 'Godavari Foods' });
    const workflowId = await saveWorkflow(seed, 'demo', { name: 'Cartons', stages: [{ name: 'Printing' }, { name: 'Packing' }] });
    await createJob(seed, 'demo', { customer_id: customerId, workflow_id: workflowId, title: 'Carton boxes', quantity: 1000, unit: 'pcs', status: 'approved' });
    seed.close();

    render(
      <AuthProvider backend={null}>
        <MemoryRouter initialEntries={['/jobs']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    await userEvent.click(await screen.findByText('Carton boxes'));
    const detail = await screen.findByRole('dialog');
    await userEvent.click(within(detail).getByRole('button', { name: 'Record production for Packing' }));

    const form = await screen.findByRole('dialog', { name: 'Record production' });
    expect(within(form).getByLabelText(/^Stage/)).toHaveDisplayValue('Packing');
    await userEvent.type(within(form).getByLabelText(/^Good/), '300');
    await userEvent.type(within(form).getByLabelText(/^Rejected/), '12');
    await userEvent.click(within(form).getByRole('button', { name: 'Save entry' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Give a reason for the rejected quantity.');
    await userEvent.type(within(form).getByLabelText(/Reason for rejection/), 'Crushed corner');
    await userEvent.click(within(form).getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const table = await screen.findByRole('table', { name: 'Production entries' });
    expect(within(table).getByText(/Carton boxes/)).toBeInTheDocument();
    expect(within(table).getByText('300')).toBeInTheDocument();

    await userEvent.click(within(table).getByText(/Carton boxes/));
    const entryPanel = await screen.findByRole('dialog', { name: 'Production entry' });
    expect(within(entryPanel).getByText('Crushed corner')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getAllByRole('link', { name: 'Dashboard' })[0]!);
    expect(await screen.findByText(/300 of 1,000 pcs finished/)).toBeInTheDocument();
    expect(await screen.findByText(/Finished output and rejections, last 8 weeks/)).toBeInTheDocument();
  });
});
