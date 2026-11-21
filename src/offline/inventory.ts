import { allTables, newId, type JobFlowDB, type MaterialRecord, type MovementKind, type StockMovementRecord } from './db';
import { clean, outboxEntry } from './outbox';
import { ValidationError } from './customers';
import { validateDate } from './dates';

export interface MaterialInput {
  name: string;
  code?: string | null;
  unit: string;
  category?: string | null;
  min_stock?: number | string | null;
  notes?: string | null;
  is_active?: boolean;
}

const MAX_QTY = 1_000_000_000;

function normalise(input: Partial<MaterialInput>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if ('name' in input) {
    out.name = clean(input.name);
    if (!out.name) throw new ValidationError('name', 'Enter the material name, for example "Art paper 300gsm".');
    if ((out.name as string).length > 120) throw new ValidationError('name', 'Keep the name under 120 characters.');
  }
  if ('code' in input) {
    out.code = clean(input.code);
    if (out.code && (out.code as string).length > 40) throw new ValidationError('code', 'Keep the code under 40 characters.');
  }
  if ('unit' in input) {
    out.unit = clean(input.unit);
    if (!out.unit) throw new ValidationError('unit', 'Enter the unit, for example kg, sheets or pcs.');
    if ((out.unit as string).length > 20) throw new ValidationError('unit', 'Keep the unit under 20 characters.');
  }
  if ('category' in input) {
    out.category = clean(input.category);
    if (out.category && (out.category as string).length > 60) throw new ValidationError('category', 'Keep the category under 60 characters.');
  }
  if ('min_stock' in input) {
    const raw = input.min_stock;
    const value = raw === null || raw === undefined || raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > MAX_QTY) throw new ValidationError('min_stock', 'Enter a minimum of zero or more.');
    out.min_stock = value;
  }
  if ('notes' in input) {
    out.notes = clean(input.notes);
    if (out.notes && (out.notes as string).length > 500) throw new ValidationError('notes', 'Keep notes under 500 characters.');
  }
  if ('is_active' in input) out.is_active = input.is_active !== false;
  return out;
}

export async function createMaterial(db: JobFlowDB, tenantId: string, input: MaterialInput): Promise<string> {
  const values = normalise({ ...input, min_stock: input.min_stock ?? 0, is_active: input.is_active ?? true });
  const id = newId();
  const now = new Date().toISOString();
  await db.transaction('rw', allTables(db), async () => {
    const code = values.code as string | null;
    if (code) {
      const clash = await db.materials.filter((m) => !m.deleted_at && (m.code ?? '').toLowerCase() === code.toLowerCase()).first();
      if (clash) throw new ValidationError('code', `The code ${code} is already used by ${clash.name}.`);
    }
    const record: MaterialRecord = {
      id,
      tenant_id: tenantId,
      name: values.name as string,
      code,
      unit: values.unit as string,
      category: (values.category as string | null) ?? null,
      min_stock: values.min_stock as number,
      on_hand: 0,
      notes: (values.notes as string | null) ?? null,
      is_active: values.is_active !== false,
      version: 0,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _sync: 'pending',
    };
    await db.materials.add(record);
    await db.outbox.add(outboxEntry('material.create', id, { changes: values }));
  });
  return id;
}

export async function updateMaterial(db: JobFlowDB, id: string, input: Partial<MaterialInput>): Promise<boolean> {
  const values = normalise(input);
  return db.transaction('rw', allTables(db), async () => {
    const current = await db.materials.get(id);
    if (!current || current.deleted_at) throw new ValidationError('id', 'This material no longer exists.');
    const changes: Record<string, unknown> = {};
    const base: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(values)) {
      const before = (current as unknown as Record<string, unknown>)[field] ?? null;
      const same = typeof value === 'number' ? Number(before) === value : before === value;
      if (!same) {
        changes[field] = value;
        base[field] = before;
      }
    }
    if (Object.keys(changes).length === 0) return false;
    await db.materials.put({ ...current, ...changes, updated_at: new Date().toISOString(), _sync: current._sync === 'conflict' ? 'conflict' : 'pending' });
    await db.outbox.add(outboxEntry('material.update', id, { changes, base }));
    return true;
  });
}

export async function deleteMaterial(db: JobFlowDB, id: string): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const current = await db.materials.get(id);
    if (!current || current.deleted_at) return;
    const now = new Date().toISOString();
    await db.materials.put({ ...current, deleted_at: now, updated_at: now, _sync: 'pending' });
    await db.outbox.add(outboxEntry('material.delete', id, { baseVersion: current.version }));
  });
}

export interface MovementInput {
  materialId: string;
  kind: MovementKind;
  /** Receive and issue: amount above zero. Adjust: signed change (+ found, - missing). */
  qty: number;
  date: string;
  jobId?: string | null;
  reason?: string | null;
}

/** Signed quantity a movement applies, from what the person typed. */
export function signedQty(kind: MovementKind, qty: number): number {
  return kind === 'issue' ? -Math.abs(qty) : kind === 'receive' ? Math.abs(qty) : qty;
}

export function validateMovement(input: MovementInput, today = new Date()): void {
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty === 0 || Math.abs(qty) > MAX_QTY) throw new ValidationError('qty', 'Enter a quantity other than zero.');
  if (input.kind !== 'adjust' && qty < 0) throw new ValidationError('qty', 'Enter a quantity above zero.');
  if (input.kind === 'adjust' && (clean(input.reason)?.length ?? 0) < 3) {
    throw new ValidationError('reason', 'Give a reason for the adjustment, for example "monthly count".');
  }
  validateDate(input.date, today);
}

/** Saves the movement on this device and queues it, in one transaction. */
export async function recordMovement(db: JobFlowDB, input: MovementInput): Promise<string> {
  validateMovement(input);
  const id = newId();
  await db.transaction('rw', allTables(db), async () => {
    const material = await db.materials.get(input.materialId);
    if (!material || material.deleted_at) throw new ValidationError('materialId', 'This material no longer exists.');
    const now = new Date().toISOString();
    const qty = signedQty(input.kind, Number(input.qty));
    const reason = clean(input.reason);
    const movement: StockMovementRecord = {
      id,
      tenant_id: material.tenant_id,
      material_id: material.id,
      kind: input.kind,
      qty,
      balance_after: null,
      job_id: input.jobId ?? null,
      movement_date: input.date,
      reason,
      recorded_by_name: null,
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _sync: 'pending',
    };
    await db.stockMovements.add(movement);
    await db.outbox.add(
      outboxEntry('stock.move', id, {
        materialId: material.id,
        kind: input.kind,
        qty: input.kind === 'adjust' ? qty : Math.abs(qty),
        date: input.date,
        jobId: input.jobId ?? undefined,
        reason: reason ?? undefined,
      }),
    );
  });
  return id;
}

/** Removes a movement the server refused, after the person has seen why. */
export async function discardRefusedMovement(db: JobFlowDB, id: string): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const movement = await db.stockMovements.get(id);
    if (!movement || (movement._sync !== 'rejected' && movement._sync !== 'conflict')) return;
    await db.stockMovements.delete(id);
    await db.outbox.bulkDelete(await db.outbox.where('entityId').equals(id).primaryKeys());
  });
}

/**
 * Stock to show: the server's balance plus this device's movements that have
 * not reached the server yet. Refused movements never count.
 */
export function onHand(material: Pick<MaterialRecord, 'on_hand'>, movements: Pick<StockMovementRecord, 'qty' | '_sync'>[]): number {
  return Number(material.on_hand) + movements.filter((m) => m._sync === 'pending').reduce((sum, m) => sum + Number(m.qty), 0);
}

export type StockLevel = 'negative' | 'out' | 'low' | 'ok';

export function stockLevel(onHandQty: number, minStock: number): StockLevel {
  if (onHandQty < 0) return 'negative';
  if (onHandQty === 0) return 'out';
  if (minStock > 0 && onHandQty < minStock) return 'low';
  return 'ok';
}
