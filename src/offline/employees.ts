import { allTables, newId, type EmployeeRecord, type JobFlowDB } from './db';
import { clean, outboxEntry } from './outbox';
import { ValidationError } from './customers';

export interface EmployeeInput {
  name: string;
  employee_code?: string | null;
  phone?: string | null;
  is_active?: boolean;
}

function normalise(input: Partial<EmployeeInput>): Record<string, string | boolean | null> {
  const out: Record<string, string | boolean | null> = {};
  if ('name' in input) {
    out.name = clean(input.name);
    if (!out.name) throw new ValidationError('name', "Enter the employee's name.");
    if ((out.name as string).length > 120) throw new ValidationError('name', 'Keep the name under 120 characters.');
  }
  if ('employee_code' in input) {
    out.employee_code = clean(input.employee_code);
    if (out.employee_code && (out.employee_code as string).length > 30) throw new ValidationError('employee_code', 'Keep the code under 30 characters.');
  }
  if ('phone' in input) {
    out.phone = clean(input.phone);
    if (out.phone && (out.phone as string).length > 30) throw new ValidationError('phone', 'Keep the phone number under 30 characters.');
  }
  if ('is_active' in input) out.is_active = input.is_active !== false;
  return out;
}

export async function createEmployee(db: JobFlowDB, tenantId: string, input: EmployeeInput): Promise<string> {
  const values = normalise({ ...input, is_active: input.is_active ?? true });
  const id = newId();
  const now = new Date().toISOString();
  const record: EmployeeRecord = {
    id,
    tenant_id: tenantId,
    name: values.name as string,
    employee_code: (values.employee_code as string | null) ?? null,
    phone: (values.phone as string | null) ?? null,
    is_active: values.is_active !== false,
    version: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    _sync: 'pending',
  };
  await db.transaction('rw', allTables(db), async () => {
    await db.employees.add(record);
    await db.outbox.add(outboxEntry('employee.create', id, { changes: values }));
  });
  return id;
}

export async function updateEmployee(db: JobFlowDB, id: string, input: Partial<EmployeeInput>): Promise<boolean> {
  const values = normalise(input);
  return db.transaction('rw', allTables(db), async () => {
    const current = await db.employees.get(id);
    if (!current || current.deleted_at) throw new ValidationError('id', 'This employee no longer exists.');
    const changes: Record<string, unknown> = {};
    const base: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(values)) {
      const before = (current as unknown as Record<string, unknown>)[field] ?? null;
      if (before !== value) {
        changes[field] = value;
        base[field] = before;
      }
    }
    if (Object.keys(changes).length === 0) return false;
    await db.employees.put({ ...current, ...changes, updated_at: new Date().toISOString(), _sync: current._sync === 'conflict' ? 'conflict' : 'pending' });
    await db.outbox.add(outboxEntry('employee.update', id, { changes, base }));
    return true;
  });
}

export async function deleteEmployee(db: JobFlowDB, id: string): Promise<void> {
  await db.transaction('rw', allTables(db), async () => {
    const current = await db.employees.get(id);
    if (!current || current.deleted_at) return;
    const now = new Date().toISOString();
    await db.employees.put({ ...current, deleted_at: now, updated_at: now, _sync: 'pending' });
    await db.outbox.add(outboxEntry('employee.delete', id, { baseVersion: current.version }));
  });
}
