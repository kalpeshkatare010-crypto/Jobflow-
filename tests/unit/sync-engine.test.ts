import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { JobFlowDB } from '../../src/offline/db';
import { createCustomer, deleteCustomer, resolveCustomerConflict, updateCustomer, ValidationError } from '../../src/offline/customers';
import { retryDelay, SyncEngine } from '../../src/sync/engine';
import { toSyncState } from '../../src/sync/status';
import { createFakeSyncServer } from './fakeSyncServer';

const opened: JobFlowDB[] = [];
let counter = 0;

function device(server: ReturnType<typeof createFakeSyncServer>, name = `device-${++counter}`, online = { value: true }) {
  const db = new JobFlowDB(name);
  opened.push(db);
  const engine = new SyncEngine({ db, api: server.api(), tenantId: 't', isOnline: () => online.value, random: () => 0 });
  return { db, engine, online, name };
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe('saving on the device', () => {
  it('saves a customer and its queued change together, without the network', async () => {
    const server = createFakeSyncServer();
    const { db, engine } = device(server, undefined, { value: false });
    const id = await createCustomer(db, 't', { name: '  Deccan Pumps ', gstin: '27abcde1234f1z5' });
    await engine.syncNow();

    const row = await db.customers.get(id);
    expect(row).toMatchObject({ name: 'Deccan Pumps', gstin: '27ABCDE1234F1Z5', _sync: 'pending', version: 0 });
    expect(await db.outbox.count()).toBe(1);
    expect(server.calls.push).toBe(0);
    await engine.refreshCounts();
    expect(toSyncState(engine.getStatus())).toMatchObject({ kind: 'offline', pending: 1 });
  });

  it('keeps waiting changes after the app is closed and reopened', async () => {
    const server = createFakeSyncServer();
    const first = device(server, 'restart-test', { value: false });
    const id = await createCustomer(first.db, 't', { name: 'Kaveri Agro Tools' });
    first.db.close();

    const reopened = new JobFlowDB('restart-test');
    opened.push(reopened);
    expect(await reopened.customers.get(id)).toMatchObject({ name: 'Kaveri Agro Tools', _sync: 'pending' });
    expect(await reopened.outbox.count()).toBe(1);
  });

  it('refuses invalid details before saving', async () => {
    const server = createFakeSyncServer();
    const { db } = device(server);
    await expect(createCustomer(db, 't', { name: '   ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(createCustomer(db, 't', { name: 'X', gstin: '123' })).rejects.toThrow(/GSTIN/);
    expect(await db.customers.count()).toBe(0);
  });

  it('records only the fields that changed, with their previous values', async () => {
    const server = createFakeSyncServer();
    const { db } = device(server, undefined, { value: false });
    const id = await createCustomer(db, 't', { name: 'Deccan Pumps', phone: '111' });
    expect(await updateCustomer(db, id, { name: 'Deccan Pumps', phone: '222' })).toBe(true);
    expect(await updateCustomer(db, id, { phone: '222' })).toBe(false);
    const entries = await db.outbox.toArray();
    expect(entries.at(-1)?.payload).toEqual({ changes: { phone: '222' }, base: { phone: '111' } });
  });
});

describe('syncing', () => {
  it('uploads waiting changes when the connection returns, exactly once', async () => {
    const server = createFakeSyncServer();
    const online = { value: false };
    const { db, engine } = device(server, undefined, online);
    const id = await createCustomer(db, 't', { name: 'Deccan Pumps' });

    online.value = true;
    await engine.syncNow();

    expect(server.rows.size).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.customers.get(id)).toMatchObject({ _sync: 'synced', version: 1 });
    expect(toSyncState(engine.getStatus()).kind).toBe('connected');
  });

  it('never creates a duplicate when the reply is lost after the server saved', async () => {
    const server = createFakeSyncServer();
    const { db, engine } = device(server);
    const id = await createCustomer(db, 't', { name: 'Deccan Pumps' });

    server.setMode('lose-response');
    await engine.syncNow();
    expect(await db.outbox.count()).toBe(1);
    expect(toSyncState(engine.getStatus())).toMatchObject({ kind: 'failed', pending: 1 });

    await engine.syncNow();
    expect(server.rows.size).toBe(1);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.customers.get(id)).toMatchObject({ _sync: 'synced' });
  });

  it('keeps changes and reports failure while the server is down', async () => {
    const server = createFakeSyncServer();
    const { db, engine } = device(server);
    await createCustomer(db, 't', { name: 'Deccan Pumps' });
    server.setMode('down');
    await engine.syncNow();
    expect(await db.outbox.count()).toBe(1);
    expect(engine.getStatus().lastError).toBe('The server did not respond');
    engine.stop();
  });

  it('brings a customer created on one device to another device once', async () => {
    const server = createFakeSyncServer();
    const a = device(server);
    const b = device(server);
    const id = await createCustomer(a.db, 't', { name: 'Deccan Pumps' });
    await a.engine.syncNow();
    await b.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.db.customers.count()).toBe(1);
    expect(await b.db.customers.get(id)).toMatchObject({ name: 'Deccan Pumps', _sync: 'synced' });
  });

  it('merges edits to different fields made on two devices', async () => {
    const server = createFakeSyncServer();
    const a = device(server);
    const b = device(server);
    const id = await createCustomer(a.db, 't', { name: 'Deccan Pumps', phone: '111' });
    await a.engine.syncNow();
    await b.engine.syncNow();

    await updateCustomer(a.db, id, { name: 'Deccan Pumps Ltd' });
    await updateCustomer(b.db, id, { phone: '222' });
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    for (const db of [a.db, b.db]) {
      expect(await db.customers.get(id)).toMatchObject({ name: 'Deccan Pumps Ltd', phone: '222', _sync: 'synced' });
    }
  });

  it('keeps a local edit that is still waiting when a download changes another field', async () => {
    const server = createFakeSyncServer();
    const online = { value: true };
    const { db, engine } = device(server, undefined, online);
    const id = await createCustomer(db, 't', { name: 'Deccan Pumps', phone: '111' });
    await engine.syncNow();

    online.value = false;
    await updateCustomer(db, id, { notes: 'Call before delivery' });
    server.edit(id, { phone: '999' });
    online.value = true;
    // Download first (as if another tab pulled), then the normal cycle.
    await engine.syncNow();
    expect(await db.customers.get(id)).toMatchObject({ phone: '999', notes: 'Call before delivery', _sync: 'synced' });
  });

  it('flags a conflict instead of overwriting, and lets a person keep their version', async () => {
    const server = createFakeSyncServer();
    const a = device(server);
    const b = device(server);
    const id = await createCustomer(a.db, 't', { name: 'Deccan Pumps' });
    await a.engine.syncNow();
    await b.engine.syncNow();

    await updateCustomer(a.db, id, { name: 'DP Industries' });
    await updateCustomer(b.db, id, { name: 'Deccan Pumps Pvt Ltd' });
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(await b.db.conflicts.count()).toBe(1);
    expect(await b.db.customers.get(id)).toMatchObject({ name: 'DP Industries', _sync: 'conflict' });
    expect(toSyncState(b.engine.getStatus())).toMatchObject({ kind: 'conflict', conflicts: 1 });
    expect(server.rows.get(id)?.name).toBe('DP Industries');

    const conflict = (await b.db.conflicts.toArray())[0]!;
    expect(conflict.fields).toEqual(['name']);
    await resolveCustomerConflict(b.db, conflict.id, 'mine');
    await b.engine.syncNow();
    expect(server.rows.get(id)?.name).toBe('Deccan Pumps Pvt Ltd');
    expect(await b.db.customers.get(id)).toMatchObject({ name: 'Deccan Pumps Pvt Ltd', _sync: 'synced' });
  });

  it('asks before deleting a customer someone else just edited', async () => {
    const server = createFakeSyncServer();
    const { db, engine } = device(server);
    const id = await createCustomer(db, 't', { name: 'Deccan Pumps' });
    await engine.syncNow();
    server.edit(id, { phone: '555' });
    await deleteCustomer(db, id);
    await engine.syncNow();
    expect(server.rows.get(id)?.deleted_at).toBeNull();
    expect(await db.conflicts.count()).toBe(1);
    expect(await db.customers.get(id)).toMatchObject({ deleted_at: null, phone: '555', _sync: 'conflict' });
  });

  it('keeps a refused change for review and says why', async () => {
    const server = createFakeSyncServer();
    const { db, engine } = device(server);
    // Bypass local validation to simulate a rule only the server knows.
    await db.outbox.add({
      mutationId: 'm-bad',
      type: 'customer.create',
      entityId: 'c-bad',
      payload: { changes: { name: '' } },
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
    });
    await engine.syncNow();
    expect((await db.outbox.toArray())[0]).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(toSyncState(engine.getStatus())).toMatchObject({ kind: 'failed', reason: '1 change was refused by the server' });
  });
});

describe('retryDelay', () => {
  it('doubles from 2 seconds up to 5 minutes, with jitter', () => {
    expect(retryDelay(1, () => 0)).toBe(2000);
    expect(retryDelay(2, () => 0)).toBe(4000);
    expect(retryDelay(4, () => 0)).toBe(16000);
    expect(retryDelay(20, () => 0)).toBe(300000);
    expect(retryDelay(1, () => 1)).toBe(2600);
  });
});
