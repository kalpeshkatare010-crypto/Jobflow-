import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2, Workflow as WorkflowIcon } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Input, Panel } from '../../components/ui';
import { SyncBadge } from '../../components/SyncBadge';
import { useLocalData } from '../../offline/LocalDataProvider';
import { useAuth } from '../../auth/AuthProvider';
import type { WorkflowRecord, WorkflowStageRecord } from '../../offline/db';
import { MAX_STAGES, saveWorkflow, setWorkflowArchived } from '../../offline/workflows';
import { ValidationError } from '../../offline/customers';
import { FormError } from '../../auth/AuthLayout';
import { cn } from '../../lib/cn';

interface DraftStage {
  key: string;
  id?: string;
  name: string;
}

interface Draft {
  id?: string;
  name: string;
  description: string;
  stages: DraftStage[];
  output: number;
}

let keyCounter = 0;
const key = () => `s${++keyCounter}`;

export function WorkflowsPage() {
  const { db, tenantId, localOnly, changed } = useLocalData();
  const { status, activeWorkspace } = useAuth();
  const canEdit = status === 'demo' || (activeWorkspace !== null && activeWorkspace.role !== 'employee');

  const data = useLiveQuery(async () => {
    const workflows = (await db.workflows.toArray()).filter((w) => !w.deleted_at).sort((a, b) => a.name.localeCompare(b.name));
    const stages = (await db.workflowStages.toArray()).filter((s) => !s.deleted_at);
    return { workflows, stages };
  }, [db]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();

  const stagesFor = (id: string) =>
    (data?.stages ?? []).filter((s) => s.workflow_id === id).sort((a, b) => a.position - b.position);

  function openNew() {
    setDraft({ name: '', description: '', stages: [{ key: key(), name: '' }], output: 0 });
    setError(null);
    setNameError(undefined);
  }

  function openExisting(workflow: WorkflowRecord) {
    const stages: WorkflowStageRecord[] = stagesFor(workflow.id);
    setDraft({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description ?? '',
      stages: stages.map((s) => ({ key: key(), id: s.id, name: s.name })),
      output: Math.max(0, stages.findIndex((s) => s.counts_output)),
    });
    setError(null);
    setNameError(undefined);
  }

  function update(change: (d: Draft) => Draft) {
    setDraft((d) => (d ? change(d) : d));
  }

  function move(index: number, by: -1 | 1) {
    update((d) => {
      const stages = [...d.stages];
      const target = index + by;
      if (target < 0 || target >= stages.length) return d;
      [stages[index], stages[target]] = [stages[target]!, stages[index]!];
      const output = d.output === index ? target : d.output === target ? index : d.output;
      return { ...d, stages, output };
    });
  }

  function remove(index: number) {
    update((d) => {
      const stages = d.stages.filter((_, i) => i !== index);
      const output = d.output === index ? Math.max(0, stages.length - 1) : d.output > index ? d.output - 1 : d.output;
      return { ...d, stages, output };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setError(null);
    setNameError(undefined);
    try {
      await saveWorkflow(db, tenantId, {
        id: draft.id,
        name: draft.name,
        description: draft.description,
        stages: draft.stages.map((s) => ({ id: s.id, name: s.name })),
        outputIndex: draft.output,
      });
      changed();
      setDraft(null);
    } catch (err) {
      if (err instanceof ValidationError && err.field === 'name') setNameError(err.message);
      else setError(err instanceof Error ? err.message : 'Could not save on this device.');
    }
  }

  const workflows = data?.workflows ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-ink-500">
          A workflow is the list of stages a kind of job goes through in your shop, in your own words. Each new job copies
          its workflow's stages.
        </p>
        {canEdit ? (
          <Button onClick={openNew} icon={<Plus aria-hidden className="size-4" />}>
            New workflow
          </Button>
        ) : null}
      </div>

      {data && workflows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<WorkflowIcon aria-hidden className="size-5" />}
            title="Name your production stages"
            description="For example Cutting, Bending, Welding, Packing, or Printing, Die cutting, Pasting. You need at least one workflow before creating jobs."
            action={
              canEdit ? (
                <Button onClick={openNew} icon={<Plus aria-hidden className="size-4" />}>
                  Create your first workflow
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {workflows.map((workflow) => {
            const stages = stagesFor(workflow.id);
            return (
              <li key={workflow.id}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => openExisting(workflow)}
                  className="press w-full rounded-[var(--radius-card)] bg-surface p-5 text-left enabled:hover:ring-1 enabled:hover:ring-line-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-ink-900">{workflow.name}</p>
                      {workflow.description ? <p className="mt-0.5 text-[13px] text-ink-500">{workflow.description}</p> : null}
                    </div>
                    <span className="flex shrink-0 gap-1.5">
                      {workflow.archived_at ? <Badge>Archived</Badge> : null}
                      <SyncBadge mark={workflow._sync} localOnly={localOnly} />
                    </span>
                  </div>
                  <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px]" aria-label={`Stages of ${workflow.name}`}>
                    {stages.map((stage, index) => (
                      <li key={stage.id} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1',
                            stage.counts_output ? 'bg-signal-soft font-medium text-signal-ink' : 'bg-sunken text-ink-700',
                          )}
                        >
                          {stage.name}
                        </span>
                        {index < stages.length - 1 ? <ChevronRight aria-hidden className="size-3.5 text-ink-400" /> : null}
                      </li>
                    ))}
                  </ol>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Panel
        open={draft !== null}
        title={draft?.id ? 'Edit workflow' : 'New workflow'}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button type="submit" form="workflow-form">
              {draft?.id ? 'Save workflow' : 'Create workflow'}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            {draft?.id ? (
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  const current = workflows.find((w) => w.id === draft.id);
                  await setWorkflowArchived(db, draft.id!, !current?.archived_at);
                  changed();
                  setDraft(null);
                }}
              >
                {workflows.find((w) => w.id === draft.id)?.archived_at ? 'Restore' : 'Archive'}
              </Button>
            ) : null}
          </>
        }
      >
        {draft ? (
          <form id="workflow-form" className="flex flex-col gap-5" onSubmit={save} noValidate>
            <FormError message={error} />
            <Input
              label="Workflow name"
              required
              placeholder="e.g. Sheet metal parts"
              value={draft.name}
              error={nameError}
              onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
            />
            <Input
              label="Description"
              hint="Optional: which jobs use it"
              value={draft.description}
              onChange={(e) => update((d) => ({ ...d, description: e.target.value }))}
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[13px] font-medium text-ink-700">Stages, in order</legend>
              <p className="mb-1 text-[12px] text-ink-500">
                Choose the stage whose finished pieces count as the job's output (usually the last one).
              </p>
              {draft.stages.map((stage, index) => (
                <div key={stage.key} className="flex items-center gap-2 rounded-[var(--radius-control)] bg-sunken p-2">
                  <span className="w-5 text-center text-[12px] font-medium text-ink-500">{index + 1}</span>
                  <label className="sr-only" htmlFor={`stage-${stage.key}`}>
                    Stage {index + 1} name
                  </label>
                  <input
                    id={`stage-${stage.key}`}
                    value={stage.name}
                    placeholder="Stage name"
                    onChange={(e) =>
                      update((d) => ({ ...d, stages: d.stages.map((s) => (s.key === stage.key ? { ...s, name: e.target.value } : s)) }))
                    }
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 text-sm focus:border-info focus:ring-2 focus:ring-info/30 focus:outline-none"
                  />
                  <label className="flex items-center gap-1 text-[12px] text-ink-700" title="Counts as finished output">
                    <input
                      type="radio"
                      name="output-stage"
                      className="accent-[var(--color-info)]"
                      checked={draft.output === index}
                      onChange={() => update((d) => ({ ...d, output: index }))}
                    />
                    <span className="hidden sm:inline">Output</span>
                    <span className="sr-only sm:hidden">Counts as output</span>
                  </label>
                  <button type="button" className="press grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-surface disabled:opacity-30" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp aria-hidden className="size-4" />
                    <span className="sr-only">Move stage {index + 1} up</span>
                  </button>
                  <button type="button" className="press grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-surface disabled:opacity-30" disabled={index === draft.stages.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown aria-hidden className="size-4" />
                    <span className="sr-only">Move stage {index + 1} down</span>
                  </button>
                  <button type="button" className="press grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-surface disabled:opacity-30" disabled={draft.stages.length === 1} onClick={() => remove(index)}>
                    <Trash2 aria-hidden className="size-4" />
                    <span className="sr-only">Remove stage {index + 1}</span>
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={draft.stages.length >= MAX_STAGES}
                icon={<Plus aria-hidden className="size-4" />}
                onClick={() => update((d) => ({ ...d, stages: [...d.stages, { key: key(), name: '' }], output: d.output === d.stages.length - 1 ? d.stages.length : d.output }))}
              >
                Add stage
              </Button>
            </fieldset>
            <p className="text-[12px] text-ink-500">Changing a workflow affects new jobs only. Jobs already created keep their stages.</p>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}
