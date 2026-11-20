import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { JobFlowDB } from '../../src/offline/db';
import { createCustomer, ValidationError } from '../../src/offline/customers';
import { createEmployee, updateEmployee } from '../../src/offline/employees';
import { saveWorkflow, stagesOf } from '../../src/offline/workflows';
import { createJob, moveJob, stageStep, updateJob } from '../../src/offline/jobs';
import { JOB_MOVES, statusActions } from '../../src/domain/jobStatus';
import { SyncEngine, type MutationResult, type SyncApi } from '../../src/sync/engine';

const opened: JobFlowDB[] = [];
let n = 0;
function db() {
  const database = new JobFlowDB(`jobs-test-${++n}`);
  opened.push(database);
  return database;
}
afterEach(async () => {
  for (const database of opened.splice(0)) {
    database.close();
    await database.delete();
  }
});

async function setup() {
  const d = db();
  const customer = await createCustomer(d, 't', { name: 'Deccan Pumps' });
  const workflow = await saveWorkflow(d, 't', {
    name: 'Sheet metal',
    stages: [{ name: 'Cutting' }, { name: 'Bending' }, { name: 'Packing' }],
  });
  return { d, customer, workflow };
}

describe('workflows on the device', () => {
  it('saves ordered stages with the last one counting as output by default', async () => {
    const { d, workflow } = await setup();
    const stages = await stagesOf(d, workflow);
    expect(stages.map((s) => s.name)).toEqual(['Cutting', 'Bending', 'Packing']);
    expect(stages.map((s) => s.counts_output)).toEqual([false, false, true]);
  });

  it('refuses a workflow without stages or with a blank stage', async () => {
    const d = db();
    await expect(saveWorkflow(d, 't', { name: 'Empty', stages: [] })).rejects.toThrow(/at least one stage/);
    await expect(saveWorkflow(d, 't', { name: 'Gap', stages: [{ name: 'A' }, { name: ' ' }] })).rejects.toThrow(/Name stage 2/);
  });

  it('bases a second waiting edit on the version the first edit will create', async () => {
    const { d, workflow } = await setup();
    await saveWorkflow(d, 't', { id: workflow, name: 'Sheet metal v2', stages: [{ name: 'Cutting' }] });
    const saves = (await d.outbox.toArray()).filter((e) => e.type === 'workflow.save');
    expect(saves.map((e) => e.payload.baseVersion)).toEqual([0, 1]);
  });

  it('removes a stage that was taken out of the workflow', async () => {
    const { d, workflow } = await setup();
    const [first] = await stagesOf(d, workflow);
    await saveWorkflow(d, 't', { id: workflow, name: 'Sheet metal', stages: [{ id: first!.id, name: 'Laser cutting' }] });
    const stages = await stagesOf(d, workflow);
    expect(stages.map((s) => s.name)).toEqual(['Laser cutting']);
  });
});

describe('employees on the device', () => {
  it('adds and edits a worker with only the changed fields queued', async () => {
    const d = db();
    const id = await createEmployee(d, 't', { name: 'Ravi Shinde', employee_code: 'E01' });
    await updateEmployee(d, id, { phone: '98200 11111', name: 'Ravi Shinde' });
    const last = (await d.outbox.toArray()).at(-1);
    expect(last?.payload).toEqual({ changes: { phone: '98200 11111' }, base: { phone: null } });
    await expect(createEmployee(d, 't', { name: '' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('jobs on the device', () => {
  it('creates a job with its own copy of the workflow stages and no number yet', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 100, unit: 'pcs' });
    const job = await d.jobOrders.get(id);
    expect(job).toMatchObject({ job_number: null, status: 'draft', quantity: 100, _sync: 'pending' });
    const stages = await d.jobStages.where('job_id').equals(id).sortBy('position');
    expect(stages.map((s) => [s.name, s.status])).toEqual([
      ['Cutting', 'not_started'],
      ['Bending', 'not_started'],
      ['Packing', 'not_started'],
    ]);
    const entry = (await d.outbox.toArray()).at(-1);
    expect(entry?.type).toBe('job.create');
    expect(entry?.payload.stages?.map((s) => s.id)).toEqual(stages.map((s) => s.id));
  });

  it('later workflow edits do not change an existing job', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 1, unit: 'pcs' });
    await saveWorkflow(d, 't', { id: workflow, name: 'Sheet metal', stages: [{ name: 'One stage only' }] });
    expect(await d.jobStages.where('job_id').equals(id).count()).toBe(3);
  });

  it('checks required details', async () => {
    const { d, customer, workflow } = await setup();
    await expect(createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: '', quantity: 1, unit: 'pcs' })).rejects.toThrow(/Name the job/);
    await expect(createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'X', quantity: 0, unit: 'pcs' })).rejects.toThrow(/quantity/);
    await expect(createJob(d, 't', { customer_id: '', workflow_id: workflow, title: 'X', quantity: 1, unit: 'pcs' })).rejects.toThrow(/customer/);
  });

  it('moves status only along allowed paths, and needs a reason to cancel', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 1, unit: 'pcs' });
    await expect(moveJob(d, id, 'completed')).rejects.toThrow(/cannot move/);
    await expect(moveJob(d, id, 'cancelled')).rejects.toThrow(/reason/);
    await moveJob(d, id, 'approved');
    expect((await d.jobOrders.get(id))?.status).toBe('approved');
  });

  it('starting a stage puts an approved job into production and records history', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 1, unit: 'pcs', status: 'approved' });
    const [first] = await d.jobStages.where('job_id').equals(id).sortBy('position');
    await stageStep(d, id, first!.id, 'start');
    expect((await d.jobOrders.get(id))?.status).toBe('in_production');
    expect((await d.jobStages.get(first!.id))?.status).toBe('in_progress');
    const events = await d.jobEvents.where('job_id').equals(id).toArray();
    expect(events.map((e) => e.kind).sort()).toEqual(['created', 'stage', 'status']);
  });

  it('refuses stage work on a draft job', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 1, unit: 'pcs' });
    const [first] = await d.jobStages.where('job_id').equals(id).toArray();
    await expect(stageStep(d, id, first!.id, 'start')).rejects.toThrow(/Approve the job/);
  });

  it('queues only changed job details with their previous values', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 100, unit: 'pcs' });
    await updateJob(d, id, { quantity: 120, title: 'Brackets' });
    expect((await d.outbox.toArray()).at(-1)?.payload).toEqual({ changes: { quantity: 120 }, base: { quantity: 100 } });
  });
});

describe('sync of jobs', () => {
  it('takes the server job number and history, replacing steps shown only on this device', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 1, unit: 'pcs' });
    const local = await d.jobOrders.get(id);
    const stages = await d.jobStages.where('job_id').equals(id).toArray();
    const api: SyncApi = {
      async push(_t, mutations) {
        return mutations.map<MutationResult>((m) => {
          if (m.type !== 'job.create') return { mutationId: m.mutationId, status: 'applied' };
          return {
            mutationId: m.mutationId,
            status: 'applied',
            row: { ...local, job_number: 'JOB-0001', version: 1, _sync: undefined },
            related: {
              job_stages: stages.map((s) => ({ ...s, version: 1 })),
              job_events: [{ id: 'server-event', tenant_id: 't', job_id: id, kind: 'created', to_status: 'draft', actor_name: 'Asha', created_at: new Date().toISOString() }],
            },
          };
        });
      },
      async pull() {
        return { rows: {}, hasMore: false, cursor: {} };
      },
    };
    const engine = new SyncEngine({ db: d, api, tenantId: 't', isOnline: () => true });
    await engine.syncNow();
    expect(await d.jobOrders.get(id)).toMatchObject({ job_number: 'JOB-0001', _sync: 'synced' });
    const events = await d.jobEvents.where('job_id').equals(id).toArray();
    expect(events.map((e) => e.id)).toEqual(['server-event']);
  });

  it('records a job step the server could not apply, with its explanation', async () => {
    const { d, customer, workflow } = await setup();
    const id = await createJob(d, 't', { customer_id: customer, workflow_id: workflow, title: 'Brackets', quantity: 1, unit: 'pcs' });
    await moveJob(d, id, 'approved');
    const serverJob = { ...(await d.jobOrders.get(id)), status: 'cancelled', job_number: 'JOB-0001', version: 3 };
    const api: SyncApi = {
      async push(_t, mutations) {
        return mutations.map<MutationResult>((m) =>
          m.type === 'job.transition'
            ? { mutationId: m.mutationId, status: 'conflict', reason: 'invalid_transition', message: 'This job is now cancelled, so it cannot move to approved.', row: serverJob }
            : { mutationId: m.mutationId, status: 'applied', row: serverJob },
        );
      },
      async pull() {
        return { rows: {}, hasMore: false, cursor: {} };
      },
    };
    await new SyncEngine({ db: d, api, tenantId: 't', isOnline: () => true }).syncNow();
    expect(await d.jobOrders.get(id)).toMatchObject({ status: 'cancelled', _sync: 'conflict' });
    expect((await d.conflicts.toArray())[0]?.message).toMatch(/now cancelled/);
  });
});

describe('job status rules', () => {
  it('match the database rules exactly', () => {
    const sql = readFileSync('supabase/migrations/20261121000400_workflows_and_jobs.sql', 'utf8');
    const block = sql.slice(sql.indexOf('select (p_from, p_to) in ('), sql.indexOf(');', sql.indexOf('select (p_from, p_to) in (')));
    const pairs = [...block.matchAll(/\('(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const mine = Object.entries(JOB_MOVES).flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`)).sort();
    expect(mine).toEqual(pairs);
  });

  it('offers sensible buttons for each status', () => {
    expect(statusActions('draft', null, false).map((a) => a.label)).toEqual(['Approve job', 'Cancel job']);
    expect(statusActions('on_hold', 'approved', false)[0]).toMatchObject({ to: 'approved', label: 'Resume' });
    expect(statusActions('completed', null, false).map((a) => a.label)).toEqual(['Mark delivered']);
    expect(statusActions('completed', null, true).map((a) => a.label)).toEqual(['Mark delivered', 'Reopen']);
  });
});
