import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudOff, Plus, Search, Users, GitCompareArrows, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, Input, Panel, Textarea, type Column } from '../../components/ui';
import { useLocalData } from '../../offline/LocalDataProvider';
import { useAuth } from '../../auth/AuthProvider';
import { CUSTOMER_FIELDS, type ConflictRecord, type CustomerField, type CustomerRecord } from '../../offline/db';
import {
  createCustomer,
  deleteCustomer,
  resolveCustomerConflict,
  updateCustomer,
  ValidationError,
} from '../../offline/customers';
import { FormError } from '../../auth/AuthLayout';

const FIELD_LABEL: Record<CustomerField, string> = {
  name: 'Customer name',
  business_name: 'Business name',
  phone: 'Phone',
  email: 'Email',
  address: 'Address',
  gstin: 'GSTIN',
  notes: 'Notes',
};

type FormValues = Record<CustomerField, string>;

function emptyForm(): FormValues {
  return { name: '', business_name: '', phone: '', email: '', address: '', gstin: '', notes: '' };
}

function formFrom(record: CustomerRecord): FormValues {
  const values = emptyForm();
  for (const field of CUSTOMER_FIELDS) values[field] = record[field] ?? '';
  return values;
}

/** What the badge says about where a customer's latest change stands. */
function SyncBadge({ record, localOnly }: { record: CustomerRecord; localOnly: boolean }) {
  if (record._sync === 'conflict') {
    return (
      <Badge tone="critical" icon={<GitCompareArrows aria-hidden className="size-3" />}>
        Needs review
      </Badge>
    );
  }
  if (record._sync === 'rejected') {
    return (
      <Badge tone="critical" icon={<TriangleAlert aria-hidden className="size-3" />}>
        Not saved to cloud
      </Badge>
    );
  }
  if (record._sync === 'pending' && !localOnly) {
    return (
      <Badge tone="warning" icon={<CloudOff aria-hidden className="size-3" />}>
        On this device
      </Badge>
    );
  }
  return null;
}

function ConflictCard({ conflict, onResolve }: { conflict: ConflictRecord; onResolve: (choice: 'mine' | 'theirs') => void }) {
  const fields = conflict.fields.length > 0 ? conflict.fields : [];
  const isDelete = conflict.type === 'customer.delete';
  return (
    <div className="mb-5 rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft/60 p-4 text-sm">
      <p className="font-medium text-ink-900">
        {isDelete ? 'Someone edited this customer after you deleted it.' : 'Someone else changed this customer at the same time.'}
      </p>
      {fields.length > 0 ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {fields.map((field) => (
            <div key={field} className="contents">
              <dt className="col-span-2 mt-1 font-medium text-ink-700">{FIELD_LABEL[field as CustomerField] ?? field}</dt>
              <dd className="text-ink-500">Saved</dd>
              <dd className="text-ink-900">{String(conflict.theirs[field] ?? 'empty')}</dd>
              <dd className="text-ink-500">Yours</dd>
              <dd className="text-ink-900">{String(conflict.mine[field] ?? 'empty')}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onResolve('mine')}>
          {isDelete ? 'Delete anyway' : 'Keep yours'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onResolve('theirs')}>
          {isDelete ? 'Keep the customer' : 'Keep saved version'}
        </Button>
      </div>
    </div>
  );
}

export function CustomersPage() {
  const { db, tenantId, localOnly, changed } = useLocalData();
  const { activeWorkspace, status } = useAuth();
  const canEdit = status === 'demo' || (activeWorkspace !== null && activeWorkspace.role !== 'employee');

  const customers = useLiveQuery(
    async () => (await db.customers.toArray()).filter((c) => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [db],
  );
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), [db]);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CustomerRecord | 'new' | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<CustomerField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // "?new=1" (from the home-screen widget's + Customer button) opens the form.
  const [params, setParams] = useSearchParams();
  const wantsNew = params.get('new') === '1';
  useEffect(() => {
    if (!wantsNew) return;
    setParams({}, { replace: true });
    if (canEdit) openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!customers) return undefined;
    if (!q) return customers;
    return customers.filter((c) =>
      [c.name, c.business_name, c.phone, c.email].some((value) => value?.toLowerCase().includes(q)),
    );
  }, [customers, query]);

  const current = editing && editing !== 'new' ? customers?.find((c) => c.id === editing.id) ?? editing : null;
  const currentConflict = current ? conflicts?.find((c) => c.entityId === current.id) : undefined;

  function openNew() {
    setForm(emptyForm());
    setErrors({});
    setFormError(null);
    setConfirmDelete(false);
    setEditing('new');
  }

  function openExisting(record: CustomerRecord) {
    setForm(formFrom(record));
    setErrors({});
    setFormError(null);
    setConfirmDelete(false);
    setEditing(record);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      if (editing === 'new') {
        await createCustomer(db, tenantId, form);
      } else if (current) {
        await updateCustomer(db, current.id, form);
      }
      changed();
      setEditing(null);
    } catch (error) {
      if (error instanceof ValidationError && error.field in FIELD_LABEL) {
        setErrors({ [error.field]: error.message });
      } else {
        setFormError(error instanceof Error ? error.message : 'Could not save on this device.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!current) return;
    await deleteCustomer(db, current.id);
    changed();
    setEditing(null);
  }

  async function resolve(choice: 'mine' | 'theirs') {
    if (!currentConflict) return;
    await resolveCustomerConflict(db, currentConflict.id, choice);
    changed();
    const refreshed = await db.customers.get(currentConflict.entityId);
    if (refreshed) setForm(formFrom(refreshed));
  }

  const columns: Column<CustomerRecord>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          {c.business_name ? <p className="truncate text-[12px] text-ink-500">{c.business_name}</p> : null}
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (c) => c.phone ?? '' },
    { key: 'email', header: 'Email', hideOnMobile: true, render: (c) => c.email ?? '' },
    { key: 'sync', header: '', align: 'right', render: (c) => <SyncBadge record={c} localOnly={localOnly} /> },
  ];

  const field = (name: CustomerField, extra: { required?: boolean; type?: string; autoComplete?: string } = {}) => (
    <Input
      label={FIELD_LABEL[name]}
      value={form[name]}
      error={errors[name]}
      disabled={!canEdit}
      onChange={(event) => setForm((values) => ({ ...values, [name]: event.target.value }))}
      {...extra}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search customers</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, phone or email"
            className="h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-400 focus:border-info focus:ring-2 focus:ring-info/30 focus:outline-none"
          />
        </label>
        {canEdit ? (
          <Button onClick={openNew} icon={<Plus aria-hidden className="size-4" />}>
            Add customer
          </Button>
        ) : null}
      </div>

      {localOnly ? (
        <p className="text-[13px] text-ink-500">
          Demo mode: customers you add are saved on this device only, not in the cloud.
        </p>
      ) : null}

      <Card>
        {visible && visible.length === 0 && !query ? (
          <EmptyState
            icon={<Users aria-hidden className="size-5" />}
            title="No customers yet"
            description="Add the businesses you make jobs for. You can do this offline; it syncs when you are back online."
            action={
              canEdit ? (
                <Button onClick={openNew} icon={<Plus aria-hidden className="size-4" />}>
                  Add customer
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption="Customers"
            columns={columns}
            rows={visible ?? []}
            loading={visible === undefined}
            rowKey={(c) => c.id}
            onRowClick={openExisting}
            empty={{ title: 'No customers match your search', description: 'Try part of the name or phone number.' }}
          />
        )}
      </Card>

      <Panel
        open={editing !== null}
        title={editing === 'new' ? 'New customer' : canEdit ? 'Edit customer' : 'Customer'}
        onClose={() => setEditing(null)}
        footer={
          canEdit ? (
            <>
              <Button type="submit" form="customer-form" loading={saving}>
                {editing === 'new' ? 'Add customer' : 'Save changes'}
              </Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              {current ? (
                confirmDelete ? (
                  <Button variant="danger" className="ml-auto" onClick={() => void remove()}>
                    Confirm delete
                  </Button>
                ) : (
                  <Button variant="ghost" className="ml-auto" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </Button>
                )
              ) : null}
            </>
          ) : undefined
        }
      >
        {currentConflict ? <ConflictCard conflict={currentConflict} onResolve={(choice) => void resolve(choice)} /> : null}
        {current?._sync === 'rejected' ? (
          <p role="alert" className="mb-4 rounded-[var(--radius-control)] bg-critical-soft px-3 py-2.5 text-[13px] text-critical">
            The server did not accept the last change: {current._message ?? 'reason unknown'}. Fix the details and save again.
          </p>
        ) : null}
        <form id="customer-form" className="flex flex-col gap-4" onSubmit={save} noValidate>
          <FormError message={formError} />
          {field('name', { required: true, autoComplete: 'off' })}
          {field('business_name', { autoComplete: 'organization' })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('phone', { type: 'tel', autoComplete: 'tel' })}
            {field('email', { type: 'email', autoComplete: 'email' })}
          </div>
          <Textarea
            label={FIELD_LABEL.address}
            value={form.address}
            error={errors.address}
            disabled={!canEdit}
            onChange={(event) => setForm((values) => ({ ...values, address: event.target.value }))}
          />
          {field('gstin', { autoComplete: 'off' })}
          <Textarea
            label={FIELD_LABEL.notes}
            value={form.notes}
            error={errors.notes}
            disabled={!canEdit}
            onChange={(event) => setForm((values) => ({ ...values, notes: event.target.value }))}
          />
        </form>
      </Panel>
    </div>
  );
}
