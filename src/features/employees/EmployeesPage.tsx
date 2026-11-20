import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, UserCog } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, Input, Panel, type Column } from '../../components/ui';
import { SyncBadge } from '../../components/SyncBadge';
import { useLocalData } from '../../offline/LocalDataProvider';
import { useAuth } from '../../auth/AuthProvider';
import type { EmployeeRecord } from '../../offline/db';
import { createEmployee, deleteEmployee, updateEmployee } from '../../offline/employees';
import { ValidationError } from '../../offline/customers';
import { FormError } from '../../auth/AuthLayout';

interface Form {
  name: string;
  employee_code: string;
  phone: string;
  is_active: boolean;
}

const EMPTY: Form = { name: '', employee_code: '', phone: '', is_active: true };

export function EmployeesPage() {
  const { db, tenantId, localOnly, changed } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  const canEdit = status === 'demo' || (activeWorkspace !== null && activeWorkspace.role !== 'employee');

  const employees = useLiveQuery(
    async () => (await db.employees.toArray()).filter((e) => !e.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [db],
  );
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<EmployeeRecord | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!employees || !q) return employees;
    return employees.filter((e) => [e.name, e.employee_code, e.phone].some((v) => v?.toLowerCase().includes(q)));
  }, [employees, query]);

  function open(record: EmployeeRecord | 'new') {
    setForm(
      record === 'new'
        ? EMPTY
        : { name: record.name, employee_code: record.employee_code ?? '', phone: record.phone ?? '', is_active: record.is_active },
    );
    setErrors({});
    setFormError(null);
    setConfirmDelete(false);
    setEditing(record);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      if (editing === 'new') await createEmployee(db, tenantId, form);
      else if (editing) await updateEmployee(db, editing.id, form);
      changed();
      setEditing(null);
    } catch (error) {
      if (error instanceof ValidationError && error.field in EMPTY) setErrors({ [error.field]: error.message });
      else setFormError(error instanceof Error ? error.message : 'Could not save on this device.');
    }
  }

  const columns: Column<EmployeeRecord>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{e.name}</p>
          {e.employee_code ? <p className="text-[12px] text-ink-500">Code {e.employee_code}</p> : null}
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (e) => e.phone ?? '' },
    {
      key: 'state',
      header: '',
      align: 'right',
      render: (e) => (
        <span className="inline-flex flex-wrap justify-end gap-1.5">
          {e.is_active ? null : <Badge>Inactive</Badge>}
          <SyncBadge mark={e._sync} localOnly={localOnly} />
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search employees</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, code or phone"
            className="h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-400 focus:border-info focus:ring-2 focus:ring-info/30 focus:outline-none"
          />
        </label>
        {canEdit ? (
          <Button onClick={() => open('new')} icon={<Plus aria-hidden className="size-4" />}>
            Add employee
          </Button>
        ) : null}
      </div>
      <p className="text-[13px] text-ink-500">
        Shop-floor workers you assign to jobs. They do not need a login; people who sign in are managed in Settings.
      </p>

      <Card>
        {employees && employees.length === 0 ? (
          <EmptyState
            icon={<UserCog aria-hidden className="size-5" />}
            title="No employees yet"
            description="Add the people who work on your jobs, so you can see who does what."
            action={
              canEdit ? (
                <Button onClick={() => open('new')} icon={<Plus aria-hidden className="size-4" />}>
                  Add employee
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption="Employees"
            columns={columns}
            rows={visible ?? []}
            loading={visible === undefined}
            rowKey={(e) => e.id}
            onRowClick={canEdit ? open : undefined}
            empty={{ title: 'No employees match your search' }}
          />
        )}
      </Card>

      <Panel
        open={editing !== null}
        title={editing === 'new' ? 'New employee' : 'Edit employee'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button type="submit" form="employee-form">
              {editing === 'new' ? 'Add employee' : 'Save changes'}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            {editing && editing !== 'new' ? (
              confirmDelete ? (
                <Button
                  variant="danger"
                  className="ml-auto"
                  onClick={async () => {
                    await deleteEmployee(db, editing.id);
                    changed();
                    setEditing(null);
                  }}
                >
                  Confirm remove
                </Button>
              ) : (
                <Button variant="ghost" className="ml-auto" onClick={() => setConfirmDelete(true)}>
                  Remove
                </Button>
              )
            ) : null}
          </>
        }
      >
        <form id="employee-form" className="flex flex-col gap-4" onSubmit={save} noValidate>
          <FormError message={formError} />
          <Input label="Name" required value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Employee code"
              hint="Optional, e.g. E07"
              value={form.employee_code}
              error={errors.employee_code}
              onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
            />
            <Input label="Phone" type="tel" value={form.phone} error={errors.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <label className="flex items-center gap-3 text-sm text-ink-900">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-info)]"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Currently working here
          </label>
        </form>
      </Panel>
    </div>
  );
}
