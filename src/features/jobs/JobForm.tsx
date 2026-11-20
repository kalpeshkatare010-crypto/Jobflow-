import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Input, Select, Textarea } from '../../components/ui';
import { FormError } from '../../auth/AuthLayout';
import { useLocalData } from '../../offline/LocalDataProvider';
import type { JobPriority, JobRecord } from '../../offline/db';
import { createJob, updateJob } from '../../offline/jobs';
import { ValidationError } from '../../offline/customers';
import { PRIORITY_LABEL } from './jobData';

export const UNITS = ['pcs', 'kg', 'g', 'm', 'mm', 'l', 'set', 'box', 'roll', 'sheet'];

interface Values {
  customer_id: string;
  workflow_id: string;
  title: string;
  quantity: string;
  unit: string;
  due_date: string;
  priority: JobPriority;
  product_description: string;
  instructions: string;
  notes: string;
  approve: boolean;
}

function fromJob(job: JobRecord | null): Values {
  return {
    customer_id: job?.customer_id ?? '',
    workflow_id: job?.workflow_id ?? '',
    title: job?.title ?? '',
    quantity: job ? String(job.quantity) : '',
    unit: job?.unit ?? 'pcs',
    due_date: job?.due_date ?? '',
    priority: job?.priority ?? 'normal',
    product_description: job?.product_description ?? '',
    instructions: job?.instructions ?? '',
    notes: job?.notes ?? '',
    approve: false,
  };
}

/**
 * New job and edit-details form. The form element has id "job-form"; the
 * panel's footer holds its submit button.
 */
export function JobForm({ job, onSaved }: { job: JobRecord | null; onSaved: (id: string) => void }) {
  const { db, tenantId, changed } = useLocalData();
  const [values, setValues] = useState<Values>(() => fromJob(job));
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const options = useLiveQuery(async () => {
    const customers = (await db.customers.toArray()).filter((c) => !c.deleted_at).sort((a, b) => a.name.localeCompare(b.name));
    const workflows = (await db.workflows.toArray()).filter((w) => !w.deleted_at && !w.archived_at).sort((a, b) => a.name.localeCompare(b.name));
    return { customers, workflows };
  }, [db]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    try {
      if (job) {
        await updateJob(db, job.id, {
          customer_id: values.customer_id,
          title: values.title,
          quantity: Number(values.quantity),
          unit: values.unit,
          due_date: values.due_date || null,
          priority: values.priority,
          product_description: values.product_description,
          instructions: values.instructions,
          notes: values.notes,
        });
        changed();
        onSaved(job.id);
      } else {
        const id = await createJob(db, tenantId, {
          customer_id: values.customer_id,
          workflow_id: values.workflow_id,
          title: values.title,
          quantity: Number(values.quantity),
          unit: values.unit,
          due_date: values.due_date || null,
          priority: values.priority,
          product_description: values.product_description,
          instructions: values.instructions,
          notes: values.notes,
          status: values.approve ? 'approved' : 'draft',
        });
        changed();
        onSaved(id);
      }
    } catch (error) {
      if (error instanceof ValidationError && error.field in values) setErrors({ [error.field]: error.message });
      else setFormError(error instanceof Error ? error.message : 'Could not save on this device.');
    }
  }

  if (!options) return null;
  const missing = options.customers.length === 0 || (!job && options.workflows.length === 0);

  return (
    <form id="job-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <FormError message={formError} />
      {missing ? (
        <div className="rounded-[var(--radius-control)] bg-info-soft px-3 py-2.5 text-[13px] text-ink-700">
          Before the first job, add{' '}
          {options.customers.length === 0 ? (
            <Link className="font-medium text-info underline" to="/customers">
              a customer
            </Link>
          ) : null}
          {options.customers.length === 0 && options.workflows.length === 0 ? ' and ' : null}
          {options.workflows.length === 0 ? (
            <Link className="font-medium text-info underline" to="/workflows">
              a workflow (your stages)
            </Link>
          ) : null}
          .
        </div>
      ) : null}
      <Select
        label="Customer"
        required
        placeholder="Choose customer"
        value={values.customer_id}
        error={errors.customer_id}
        options={options.customers.map((c) => ({ value: c.id, label: c.business_name ? `${c.name} (${c.business_name})` : c.name }))}
        onChange={(e) => set('customer_id', e.target.value)}
      />
      {job ? null : (
        <Select
          label="Workflow"
          required
          placeholder="Choose the stages this job goes through"
          value={values.workflow_id}
          error={errors.workflow_id}
          options={options.workflows.map((w) => ({ value: w.id, label: w.name }))}
          onChange={(e) => set('workflow_id', e.target.value)}
        />
      )}
      <Input label="Job name" required placeholder="e.g. Mounting brackets 3 mm" value={values.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Input label="Quantity" required type="number" inputMode="decimal" min="0" step="any" value={values.quantity} error={errors.quantity} onChange={(e) => set('quantity', e.target.value)} />
        <Select label="Unit" value={values.unit} error={errors.unit} options={UNITS.map((u) => ({ value: u, label: u }))} onChange={(e) => set('unit', e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Due date" type="date" value={values.due_date} error={errors.due_date} onChange={(e) => set('due_date', e.target.value)} />
        <Select
          label="Priority"
          value={values.priority}
          options={(Object.keys(PRIORITY_LABEL) as JobPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          onChange={(e) => set('priority', e.target.value as JobPriority)}
        />
      </div>
      <Textarea label="Product description" hint="Size, material, drawing number..." value={values.product_description} onChange={(e) => set('product_description', e.target.value)} />
      <Textarea label="Instructions for the shop floor" value={values.instructions} onChange={(e) => set('instructions', e.target.value)} />
      <Textarea label="Notes" value={values.notes} onChange={(e) => set('notes', e.target.value)} />
      {job ? null : (
        <label className="flex items-center gap-3 text-sm text-ink-900">
          <input type="checkbox" className="size-4 accent-[var(--color-info)]" checked={values.approve} onChange={(e) => set('approve', e.target.checked)} />
          Approve now, ready for production
        </label>
      )}
    </form>
  );
}
