import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Boxes, Minus, Pencil, Plus, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, Input, Panel, Select, Textarea, type Column } from '../../components/ui';
import { SyncBadge } from '../../components/SyncBadge';
import { FormError } from '../../auth/AuthLayout';
import { useAuth } from '../../auth/AuthProvider';
import { useLocalData } from '../../offline/LocalDataProvider';
import type { MaterialRecord, MovementKind, StockMovementRecord } from '../../offline/db';
import { ValidationError } from '../../offline/customers';
import {
  createMaterial,
  deleteMaterial,
  discardRefusedMovement,
  onHand,
  recordMovement,
  stockLevel,
  updateMaterial,
  type StockLevel,
} from '../../offline/inventory';
import { todayIso } from '../../domain/production';
import { formatNumber } from '../../lib/format';
import { cn } from '../../lib/cn';
import { localDate, UNNUMBERED, useJobViews } from '../jobs/jobData';

export interface MaterialView {
  material: MaterialRecord;
  movements: StockMovementRecord[];
  onHand: number;
  level: StockLevel;
}

/** Materials with live stock (server balance + this device's waiting movements). */
export function useMaterialViews(): MaterialView[] | undefined {
  const { db } = useLocalData();
  return useLiveQuery(async () => {
    const [materials, movements] = await Promise.all([db.materials.toArray(), db.stockMovements.toArray()]);
    const byMaterial = new Map<string, StockMovementRecord[]>();
    for (const m of movements.sort((a, b) => b.movement_date.localeCompare(a.movement_date) || b.created_at.localeCompare(a.created_at))) {
      const list = byMaterial.get(m.material_id) ?? [];
      list.push(m);
      byMaterial.set(m.material_id, list);
    }
    return materials
      .filter((m) => !m.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((material) => {
        const list = byMaterial.get(material.id) ?? [];
        const qty = onHand(material, list);
        return { material, movements: list, onHand: qty, level: stockLevel(qty, Number(material.min_stock)) };
      });
  }, [db]);
}

const LEVEL_BADGE: Record<StockLevel, { tone: 'critical' | 'warning' | 'neutral' | 'good'; label: string } | null> = {
  negative: { tone: 'critical', label: 'Below zero' },
  out: { tone: 'critical', label: 'Out of stock' },
  low: { tone: 'warning', label: 'Low' },
  ok: null,
};

const KIND_LABEL: Record<MovementKind, string> = { receive: 'Received', issue: 'Issued', adjust: 'Adjusted' };

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Needs attention' },
] as const;

export function InventoryPage() {
  const { localOnly } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  const canManage = status === 'demo' || (activeWorkspace !== null && activeWorkspace.role !== 'employee');
  const views = useMaterialViews();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention'>('all');
  const [panel, setPanel] = useState<{ mode: 'new' } | { mode: 'view' | 'edit'; id: string } | null>(null);

  const attention = (views ?? []).filter((v) => v.level !== 'ok' && v.material.is_active);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (views ?? []).filter(
      (v) =>
        (filter === 'all' || (v.level !== 'ok' && v.material.is_active)) &&
        (!q || [v.material.name, v.material.code, v.material.category].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [views, query, filter]);
  const current = panel && panel.mode !== 'new' ? views?.find((v) => v.material.id === panel.id) : undefined;

  const columns: Column<MaterialView>[] = [
    {
      key: 'name',
      header: 'Material',
      render: ({ material }) => (
        <div className="min-w-0">
          <p className={cn('max-w-[180px] truncate text-[13px] font-medium sm:max-w-[280px]', !material.is_active && 'text-ink-400')}>{material.name}</p>
          <p className="truncate text-[12px] text-ink-500">{[material.code, material.category].filter(Boolean).join(', ') || ' '}</p>
        </div>
      ),
    },
    {
      key: 'min',
      header: 'Minimum',
      align: 'right',
      hideOnMobile: true,
      render: ({ material }) => <span className="tabular text-[13px] text-ink-500">{formatNumber(Number(material.min_stock))}</span>,
    },
    {
      key: 'onhand',
      header: 'On hand',
      align: 'right',
      render: (v) => {
        const badge = LEVEL_BADGE[v.level];
        return (
          <span className="flex flex-col items-end gap-1">
            <span className={cn('tabular text-[13px] font-semibold', v.level === 'negative' || v.level === 'out' ? 'text-critical' : '')}>
              {formatNumber(v.onHand)} <span className="font-normal text-ink-500">{v.material.unit}</span>
            </span>
            {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : <SyncBadge mark={v.material._sync} localOnly={localOnly} />}
          </span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search materials</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, code or category"
            className="h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-400 focus:border-info focus:ring-2 focus:ring-info/30 focus:outline-none"
          />
        </label>
        {canManage ? (
          <Button onClick={() => setPanel({ mode: 'new' })} icon={<Plus aria-hidden className="size-4" />}>
            Add material
          </Button>
        ) : null}
      </div>

      <div role="tablist" aria-label="Filter materials" className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            type="button"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'press flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium',
              filter === f.value ? 'bg-ink-900 text-on-ink' : 'bg-surface text-ink-700 hover:bg-sunken',
            )}
          >
            {f.label}
            <span className={cn('tabular text-[12px]', filter === f.value ? 'opacity-70' : 'text-ink-400')}>
              {f.value === 'all' ? (views?.length ?? 0) : attention.length}
            </span>
          </button>
        ))}
      </div>

      {attention.some((v) => v.level === 'negative') ? (
        <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-critical/10 p-3 text-[13px]">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-critical" />
          Some stock is below zero: more was issued than was recorded as received. Count it and record an adjustment.
        </p>
      ) : null}

      <Card>
        {views && views.length === 0 ? (
          <EmptyState
            icon={<Boxes aria-hidden className="size-5" />}
            title="No materials yet"
            description="Add the materials you buy and use, set a minimum, and JobFlow warns you when stock runs low."
            action={
              canManage ? (
                <Button onClick={() => setPanel({ mode: 'new' })} icon={<Plus aria-hidden className="size-4" />}>
                  Add the first material
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption="Materials"
            columns={columns}
            rows={visible}
            loading={views === undefined}
            rowKey={(v) => v.material.id}
            onRowClick={(v) => setPanel({ mode: 'view', id: v.material.id })}
            empty={{ title: filter === 'attention' ? 'Nothing needs attention' : 'No materials match', description: 'Stock is at or above every minimum.' }}
          />
        )}
      </Card>

      <Panel
        open={panel !== null}
        title={panel?.mode === 'new' ? 'New material' : panel?.mode === 'edit' ? 'Edit material' : (current?.material.name ?? 'Material')}
        onClose={() => setPanel(null)}
        footer={
          panel?.mode === 'new' || panel?.mode === 'edit' ? (
            <>
              <Button type="submit" form="material-form">
                {panel.mode === 'new' ? 'Add material' : 'Save changes'}
              </Button>
              <Button variant="secondary" onClick={() => setPanel(panel.mode === 'edit' ? { mode: 'view', id: panel.id } : null)}>
                Cancel
              </Button>
            </>
          ) : undefined
        }
      >
        {panel?.mode === 'new' ? <MaterialForm material={null} onSaved={(id) => setPanel({ mode: 'view', id })} /> : null}
        {panel?.mode === 'edit' && current ? <MaterialForm material={current.material} onSaved={(id) => setPanel({ mode: 'view', id })} /> : null}
        {panel?.mode === 'view' && current ? (
          <MaterialDetail view={current} canManage={canManage} onEdit={() => setPanel({ mode: 'edit', id: current.material.id })} onDeleted={() => setPanel(null)} />
        ) : null}
      </Panel>
    </div>
  );
}

// -----------------------------------------------------------------------------
function MaterialForm({ material, onSaved }: { material: MaterialRecord | null; onSaved: (id: string) => void }) {
  const { db, tenantId } = useLocalData();
  const [name, setName] = useState(material?.name ?? '');
  const [code, setCode] = useState(material?.code ?? '');
  const [unit, setUnit] = useState(material?.unit ?? 'pcs');
  const [category, setCategory] = useState(material?.category ?? '');
  const [minStock, setMinStock] = useState(material ? String(Number(material.min_stock)) : '');
  const [notes, setNotes] = useState(material?.notes ?? '');
  const [active, setActive] = useState(material?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const input = { name, code, unit, category, min_stock: minStock, notes, is_active: active };
    try {
      if (material) {
        await updateMaterial(db, material.id, input);
        onSaved(material.id);
      } else {
        onSaved(await createMaterial(db, tenantId, input));
      }
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Could not save the material. Try again.');
    }
  }

  return (
    <form id="material-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <FormError message={error} />
      <Input label="Material name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus={!material} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Code" hint="Optional, unique" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input label="Unit" required value={unit} onChange={(e) => setUnit(e.target.value)} list="material-units" />
        <datalist id="material-units">
          {['pcs', 'kg', 'g', 'litre', 'metre', 'sheets', 'rolls', 'boxes', 'packets'].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Minimum stock" hint="Warn below this" inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        <Input label="Category" hint="Optional" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {material ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-ink-900" />
          In use (untick to hide from low-stock warnings)
        </label>
      ) : (
        <p className="text-[12px] text-ink-500">Stock starts at zero. Record what you have with Receive once the material is added.</p>
      )}
    </form>
  );
}

// -----------------------------------------------------------------------------
function MaterialDetail({ view, canManage, onEdit, onDeleted }: { view: MaterialView; canManage: boolean; onEdit: () => void; onDeleted: () => void }) {
  const { db, localOnly } = useLocalData();
  const { material, movements } = view;
  const [kind, setKind] = useState<MovementKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const badge = LEVEL_BADGE[view.level];

  return (
    <div className="flex flex-col gap-5 text-[13px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[12px] text-ink-500">On hand</p>
          <p className={cn('tabular text-[28px] leading-tight font-semibold', view.onHand < 0 && 'text-critical')}>
            {formatNumber(view.onHand)} <span className="text-[15px] font-normal text-ink-500">{material.unit}</span>
          </p>
          <p className="text-[12px] text-ink-500">Minimum {formatNumber(Number(material.min_stock))}</p>
        </div>
        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
      </div>

      {kind ? (
        <MovementForm material={material} kind={kind} onDone={() => setKind(null)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button size="sm" onClick={() => setKind('receive')} icon={<Plus aria-hidden className="size-3.5" />}>
              Receive
            </Button>
          ) : null}
          <Button size="sm" variant={canManage ? 'secondary' : 'primary'} onClick={() => setKind('issue')} icon={<Minus aria-hidden className="size-3.5" />}>
            Issue
          </Button>
          {canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setKind('adjust')} icon={<SlidersHorizontal aria-hidden className="size-3.5" />}>
              Adjust after count
            </Button>
          ) : null}
        </div>
      )}

      <section aria-labelledby="moves-h">
        <h3 id="moves-h" className="font-semibold text-ink-700">
          Stock history
        </h3>
        {movements.length === 0 ? <p className="mt-1 text-ink-500">No movements yet.</p> : null}
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {movements.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {KIND_LABEL[m.kind]}{' '}
                  <span className={cn('tabular', Number(m.qty) < 0 ? 'text-critical' : 'text-good')}>
                    {Number(m.qty) > 0 ? '+' : ''}
                    {formatNumber(Number(m.qty))}
                  </span>
                </p>
                <p className="text-[12px] text-ink-500">
                  {localDate(m.movement_date)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  {m.reason ? `, ${m.reason}` : ''}
                  {m.recorded_by_name ? `, by ${m.recorded_by_name}` : ''}
                </p>
                {m._sync === 'rejected' || m._sync === 'conflict' ? (
                  <p className="mt-1 text-[12px] text-critical">
                    Not recorded: {m._message ?? 'the server refused it.'}{' '}
                    <button type="button" className="font-medium underline" onClick={() => void discardRefusedMovement(db, m.id)}>
                      Remove
                    </button>
                  </p>
                ) : null}
              </div>
              <span className="flex shrink-0 flex-col items-end gap-1 text-[12px] text-ink-500">
                {m.balance_after !== null ? <span className="tabular">= {formatNumber(Number(m.balance_after))}</span> : null}
                <SyncBadge mark={m._sync} localOnly={localOnly} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button size="sm" variant="secondary" onClick={onEdit} icon={<Pencil aria-hidden className="size-3.5" />}>
            Edit details
          </Button>
          {confirmDelete ? (
            <Button size="sm" variant="danger" onClick={() => void deleteMaterial(db, material.id).then(onDeleted)}>
              Yes, remove {material.name}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(true)}>
              Remove material
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MovementForm({ material, kind, onDone }: { material: MaterialRecord; kind: MovementKind; onDone: () => void }) {
  const { db } = useLocalData();
  const views = useJobViews(db);
  const [qty, setQty] = useState('');
  const [direction, setDirection] = useState<'add' | 'remove'>('remove');
  const [date, setDate] = useState(todayIso());
  const [jobId, setJobId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const openJobs = (views ?? []).filter((v) => ['approved', 'in_production', 'on_hold'].includes(v.job.status));

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const amount = Number(qty);
    try {
      await recordMovement(db, {
        materialId: material.id,
        kind,
        qty: kind === 'adjust' ? (direction === 'remove' ? -Math.abs(amount) : Math.abs(amount)) : amount,
        date,
        jobId: jobId || null,
        reason,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Could not save. Try again.');
    }
  }

  const title = kind === 'receive' ? 'Receive stock' : kind === 'issue' ? 'Issue stock' : 'Adjust after a count';
  return (
    <form className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line p-3" onSubmit={save} noValidate aria-label={title}>
      <p className="font-semibold">{title}</p>
      <FormError message={error} />
      {kind === 'adjust' ? (
        <Select
          label="Change"
          value={direction}
          options={[
            { value: 'remove', label: 'Less than recorded (missing, damaged)' },
            { value: 'add', label: 'More than recorded (found)' },
          ]}
          onChange={(e) => setDirection(e.target.value as 'add' | 'remove')}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Input label={`Quantity (${material.unit})`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        <Input label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
      </div>
      {kind === 'issue' && openJobs.length > 0 ? (
        <Select
          label="For job"
          value={jobId}
          placeholder="Not for a particular job"
          options={openJobs.map((v) => ({ value: v.job.id, label: `${v.job.job_number ?? UNNUMBERED} - ${v.job.title}` }))}
          onChange={(e) => setJobId(e.target.value)}
        />
      ) : null}
      <Input
        label={kind === 'adjust' ? 'Reason' : 'Note'}
        required={kind === 'adjust'}
        placeholder={kind === 'receive' ? 'For example: supplier bill number' : kind === 'adjust' ? 'For example: monthly count' : 'Optional'}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Save
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Back
        </Button>
      </div>
    </form>
  );
}
