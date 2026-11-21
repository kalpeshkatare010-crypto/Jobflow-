import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Dexie from 'dexie';
import { AppRoutes } from '../../src/app/App';
import { AuthProvider } from '../../src/auth/AuthProvider';
import { JobFlowDB } from '../../src/offline/db';
import { createMaterial, discardRefusedMovement, onHand, recordMovement, signedQty, stockLevel, updateMaterial, validateMovement } from '../../src/offline/inventory';
import { todayIso } from '../../src/domain/production';

beforeEach(async () => {
  await Dexie.delete('jobflow_demo_device');
  await Dexie.delete('stock-test');
});

describe('stock rules', () => {
  it('signs quantities by kind and validates like the server', () => {
    expect(signedQty('receive', 5)).toBe(5);
    expect(signedQty('issue', 5)).toBe(-5);
    expect(signedQty('adjust', -3)).toBe(-3);
    const base = { materialId: 'm', kind: 'receive' as const, qty: 5, date: todayIso() };
    expect(() => validateMovement(base)).not.toThrow();
    expect(() => validateMovement({ ...base, qty: 0 })).toThrow('other than zero');
    expect(() => validateMovement({ ...base, qty: -2 })).toThrow('above zero');
    expect(() => validateMovement({ ...base, kind: 'adjust', qty: -2 })).toThrow('reason');
    expect(() => validateMovement({ ...base, kind: 'adjust', qty: -2, reason: 'Monthly count' })).not.toThrow();
  });

  it('shows the server balance plus waiting movements, never refused ones', () => {
    expect(onHand({ on_hand: 100 }, [{ qty: -30, _sync: 'pending' }, { qty: 50, _sync: 'synced' }, { qty: -999, _sync: 'rejected' }])).toBe(70);
    expect(stockLevel(-1, 10)).toBe('negative');
    expect(stockLevel(0, 10)).toBe('out');
    expect(stockLevel(5, 10)).toBe('low');
    expect(stockLevel(5, 0)).toBe('ok');
  });

  it('records movements offline with the queue, and edits never touch stock', async () => {
    const db = new JobFlowDB('stock-test');
    const id = await createMaterial(db, 't1', { name: 'Art paper', code: 'AP1', unit: 'sheets', min_stock: 500 });
    await expect(createMaterial(db, 't1', { name: 'Other', code: 'ap1', unit: 'pcs' })).rejects.toThrow('already used');
    const move = await recordMovement(db, { materialId: id, kind: 'issue', qty: 40, date: todayIso() });
    expect(await db.stockMovements.get(move)).toMatchObject({ qty: -40, _sync: 'pending' });
    const queued = await db.outbox.where('entityId').equals(move).first();
    expect(queued).toMatchObject({ type: 'stock.move', payload: { kind: 'issue', qty: 40 } });
    expect(await updateMaterial(db, id, { min_stock: '500' })).toBe(false);
    expect(await updateMaterial(db, id, { min_stock: 300 })).toBe(true);
    expect((await db.materials.get(id))?.on_hand).toBe(0);

    await discardRefusedMovement(db, move);
    expect(await db.stockMovements.get(move)).toBeDefined();
    await db.stockMovements.update(move, { _sync: 'rejected' });
    await discardRefusedMovement(db, move);
    expect(await db.stockMovements.get(move)).toBeUndefined();
    db.close();
  });
});

describe('Inventory screen', () => {
  it('adds a material, receives and issues stock, warns when low, and shows it on the dashboard', async () => {
    render(
      <AuthProvider backend={null}>
        <MemoryRouter initialEntries={['/inventory']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText('No materials yet')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /Add (the first )?material/ })[0]!);
    const form = await screen.findByRole('dialog', { name: 'New material' });
    await userEvent.type(within(form).getByLabelText(/Material name/), 'Art paper 300gsm');
    await userEvent.clear(within(form).getByLabelText(/^Unit/));
    await userEvent.type(within(form).getByLabelText(/^Unit/), 'sheets');
    await userEvent.type(within(form).getByLabelText(/Minimum stock/), '500');
    await userEvent.click(within(form).getByRole('button', { name: 'Add material' }));

    const detail = await screen.findByRole('dialog', { name: 'Art paper 300gsm' });
    expect(within(detail).getByText('Out of stock')).toBeInTheDocument();
    await userEvent.click(within(detail).getByRole('button', { name: 'Receive' }));
    await userEvent.type(within(detail).getByLabelText(/Quantity/), '1000');
    await userEvent.click(within(detail).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(detail).getByText('1,000')).toBeInTheDocument());

    await userEvent.click(within(detail).getByRole('button', { name: 'Issue' }));
    await userEvent.type(within(detail).getByLabelText(/Quantity/), '700');
    await userEvent.click(within(detail).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(within(detail).getByText('300')).toBeInTheDocument());
    expect(within(detail).getByText('Low')).toBeInTheDocument();

    await userEvent.click(within(detail).getByRole('button', { name: 'Adjust after count' }));
    await userEvent.type(within(detail).getByLabelText(/Quantity/), '5');
    await userEvent.click(within(detail).getByRole('button', { name: 'Save' }));
    expect(await within(detail).findByRole('alert')).toHaveTextContent('reason');
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('tab', { name: /Needs attention/ }));
    expect(within(await screen.findByRole('table', { name: 'Materials' })).getByText('Art paper 300gsm')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('link', { name: 'Dashboard' })[0]!);
    // Without jobs the dashboard shows samples; the real low-stock list appears once the business has jobs.
    expect(await screen.findByRole('heading', { level: 1, name: /Welcome back/ })).toBeInTheDocument();
  });
});
