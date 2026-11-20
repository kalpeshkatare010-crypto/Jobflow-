-- =============================================================================
-- JobFlow migration 0004: employee sync, workflows and stages, job orders
--
-- Employees use the same field-merge sync as customers (generic function).
-- Workflows and jobs have rules that must hold for every write (job numbers,
-- allowed status moves, stage states, plan limits), so the app cannot write
-- those tables directly: the only way in is through the checked functions
-- below, called by sync_push. They are SECURITY DEFINER and therefore check
-- membership, permission and subscription themselves.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generic field-merge mutation for simple tables (employees)
-- -----------------------------------------------------------------------------
create function private.apply_record_mutation(
  p_tenant uuid, p_table text, p_fields text[], p_action text, p_entity uuid, p_payload jsonb
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_changes jsonb := coalesce(p_payload -> 'changes', '{}'::jsonb);
  v_base jsonb := coalesce(p_payload -> 'base', '{}'::jsonb);
  v_current jsonb;
  v_row jsonb;
  v_merged jsonb := '{}'::jsonb;
  v_conflicts text[] := array[]::text[];
  v_cols text[];
  v_key text;
begin
  if p_action = 'create' then
    select array_agg(k) into v_cols from jsonb_object_keys(v_changes) k where k = any (p_fields);
    if v_cols is null then
      raise exception 'nothing to save' using errcode = '23502';
    end if;
    execute format(
      'insert into public.%1$I as t (id, tenant_id, %2$s) select $1, $2, %3$s from jsonb_populate_record(null::public.%1$I, $3) r returning to_jsonb(t)',
      p_table,
      (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
      (select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c))
    into v_row using p_entity, p_tenant, v_changes;
    return jsonb_build_object('status', 'applied', 'row', v_row - 'txid');
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1 and tenant_id = $2 for update', p_table)
    into v_current using p_entity, p_tenant;
  if v_current is null then
    execute format('select to_jsonb(t) from public.%I t where id = $1 and tenant_id = $2', p_table)
      into v_current using p_entity, p_tenant;
    if v_current is not null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This record no longer exists.');
  end if;

  if p_action = 'delete' then
    if v_current ->> 'deleted_at' is not null then
      return jsonb_build_object('status', 'applied', 'row', v_current - 'txid');
    end if;
    if (v_current ->> 'version')::integer > coalesce((p_payload ->> 'baseVersion')::integer, 0) then
      return jsonb_build_object('status', 'conflict', 'reason', 'edited_after_delete', 'row', v_current - 'txid');
    end if;
    execute format('update public.%I t set deleted_at = now() where id = $1 returning to_jsonb(t)', p_table)
      into v_row using p_entity;
    if v_row is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'applied', 'row', v_row - 'txid');
  end if;

  if v_current ->> 'deleted_at' is not null then
    return jsonb_build_object('status', 'conflict', 'reason', 'deleted', 'row', v_current - 'txid', 'fields', '[]'::jsonb);
  end if;

  for v_key in select jsonb_object_keys(v_changes) loop
    continue when not (v_key = any (p_fields));
    if private.jtext(v_current, v_key) is not distinct from private.jtext(v_base, v_key)
       or private.jtext(v_current, v_key) is not distinct from private.jtext(v_changes, v_key) then
      v_merged := v_merged || jsonb_build_object(v_key, v_changes -> v_key);
    else
      v_conflicts := v_conflicts || v_key;
    end if;
  end loop;

  v_row := v_current;
  if v_merged <> '{}'::jsonb then
    execute format(
      'update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I, $1) r where t.id = $2 returning to_jsonb(t)',
      p_table,
      (select string_agg(format('%1$I = r.%1$I', k), ', ') from jsonb_object_keys(v_merged) k))
    into v_row using v_merged, p_entity;
    if v_row is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if cardinality(v_conflicts) > 0 then
    return jsonb_build_object('status', 'conflict', 'reason', 'same_field', 'fields', to_jsonb(v_conflicts), 'row', v_row - 'txid');
  end if;
  return jsonb_build_object('status', 'applied', 'row', v_row - 'txid');
end;
$$;

-- -----------------------------------------------------------------------------
-- Workflows and their stages (named by each business; nothing built in)
-- -----------------------------------------------------------------------------
create table public.workflows (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 300),
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  unique (id, tenant_id)
);
create index workflows_sync on public.workflows (tenant_id, txid, id);
create trigger workflows_stamp before insert or update on public.workflows
  for each row execute function private.stamp_tenant_row();

create table public.workflow_stages (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  workflow_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position smallint not null check (position between 0 and 49),
  counts_output boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  foreign key (workflow_id, tenant_id) references public.workflows (id, tenant_id)
);
create index workflow_stages_sync on public.workflow_stages (tenant_id, txid, id);
create index workflow_stages_workflow on public.workflow_stages (workflow_id) where deleted_at is null;
create trigger workflow_stages_stamp before insert or update on public.workflow_stages
  for each row execute function private.stamp_tenant_row();

-- -----------------------------------------------------------------------------
-- Job orders, each with its own copy of the workflow's stages
-- -----------------------------------------------------------------------------
create table public.job_orders (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_number text not null,
  customer_id uuid not null references public.customers (id),
  workflow_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  product_description text check (char_length(product_description) <= 2000),
  quantity numeric(14, 3) not null check (quantity > 0 and quantity < 1e10),
  unit text not null check (char_length(btrim(unit)) between 1 and 20),
  order_date date not null default current_date,
  due_date date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'in_production', 'on_hold', 'completed', 'delivered', 'cancelled')),
  held_from text check (held_from in ('approved', 'in_production')),
  notes text check (char_length(notes) <= 2000),
  instructions text check (char_length(instructions) <= 4000),
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  unique (tenant_id, job_number),
  unique (id, tenant_id)
);
create index job_orders_sync on public.job_orders (tenant_id, txid, id);
create index job_orders_status on public.job_orders (tenant_id, status, due_date) where deleted_at is null;
create trigger job_orders_stamp before insert or update on public.job_orders
  for each row execute function private.stamp_tenant_row();

create table public.job_stages (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position smallint not null check (position between 0 and 49),
  counts_output boolean not null default false,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done', 'skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  foreign key (job_id, tenant_id) references public.job_orders (id, tenant_id)
);
create index job_stages_sync on public.job_stages (tenant_id, txid, id);
create index job_stages_job on public.job_stages (job_id, position);
create trigger job_stages_stamp before insert or update on public.job_stages
  for each row execute function private.stamp_tenant_row();

-- Append-only history: every status move and stage step.
create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_id uuid not null,
  kind text not null check (kind in ('created', 'status', 'stage', 'edited')),
  from_status text,
  to_status text,
  stage_name text,
  stage_action text,
  reason text check (char_length(reason) <= 500),
  actor_name text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  foreign key (job_id, tenant_id) references public.job_orders (id, tenant_id)
);
create index job_events_sync on public.job_events (tenant_id, txid, id);
create index job_events_job on public.job_events (job_id, created_at);
create trigger job_events_stamp before insert or update on public.job_events
  for each row execute function private.stamp_tenant_row();

-- Read-only to the app; all writes go through the functions below.
revoke all on public.workflows, public.workflow_stages, public.job_orders, public.job_stages, public.job_events
  from anon, authenticated;
grant select on public.workflows, public.workflow_stages, public.job_orders, public.job_stages, public.job_events
  to authenticated;

alter table public.workflows enable row level security;
alter table public.workflow_stages enable row level security;
alter table public.job_orders enable row level security;
alter table public.job_stages enable row level security;
alter table public.job_events enable row level security;
create policy workflows_read on public.workflows for select to authenticated using (private.is_member(tenant_id));
create policy workflow_stages_read on public.workflow_stages for select to authenticated using (private.is_member(tenant_id));
create policy job_orders_read on public.job_orders for select to authenticated using (private.is_member(tenant_id));
create policy job_stages_read on public.job_stages for select to authenticated using (private.is_member(tenant_id));
create policy job_events_read on public.job_events for select to authenticated using (private.is_member(tenant_id));

-- -----------------------------------------------------------------------------
-- Shared checks for the definer functions
-- -----------------------------------------------------------------------------
create function private.require(p_tenant uuid, p_permission text) returns void
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_tenant, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not private.tenant_can_write(p_tenant) then
    raise exception 'read only' using errcode = '42501', hint = 'read_only';
  end if;
end;
$$;

create function private.actor_name() returns text
language sql stable security definer
set search_path = ''
as $$ select nullif(full_name, '') from public.profiles where user_id = auth.uid() $$;

-- Same value? Numbers compare as numbers (100 = 100.000), the rest as text.
create function private.same_field(p_a jsonb, p_b jsonb, p_key text) returns boolean
language sql immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_a -> p_key) = 'number' or jsonb_typeof(p_b -> p_key) = 'number'
      then (p_a ->> p_key)::numeric is not distinct from (p_b ->> p_key)::numeric
    else private.jtext(p_a, p_key) is not distinct from private.jtext(p_b, p_key)
  end;
$$;

-- Allowed job status moves (mirrored in src/domain/jobStatus.ts).
create function private.job_move_allowed(p_from text, p_to text) returns boolean
language sql immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('draft', 'approved'), ('draft', 'cancelled'),
    ('approved', 'draft'), ('approved', 'in_production'), ('approved', 'on_hold'), ('approved', 'cancelled'),
    ('in_production', 'on_hold'), ('in_production', 'completed'), ('in_production', 'cancelled'),
    ('on_hold', 'approved'), ('on_hold', 'in_production'), ('on_hold', 'cancelled'),
    ('completed', 'delivered'), ('completed', 'in_production'),
    ('cancelled', 'draft')
  );
$$;

-- -----------------------------------------------------------------------------
-- Workflow save: the whole workflow with its ordered stages
-- -----------------------------------------------------------------------------
create function private.apply_workflow_mutation(p_tenant uuid, p_type text, p_entity uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_current public.workflows%rowtype;
  v_row public.workflows%rowtype;
  v_stage jsonb;
  v_ids uuid[] := array[]::uuid[];
  v_count integer;
  v_outputs integer;
  v_limit integer;
  v_stages jsonb;
  v_exists boolean;
begin
  perform private.require(p_tenant, 'workflows.manage');

  select * into v_current from public.workflows where id = p_entity and tenant_id = p_tenant for update;
  v_exists := found; -- later SELECT INTOs change FOUND

  if p_type = 'workflow.archive' then
    if not v_exists then
      return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This workflow no longer exists.');
    end if;
    update public.workflows set archived_at = case when (p_payload ->> 'archived')::boolean then now() end
    where id = p_entity returning * into v_row;
  else
    v_stages := coalesce(p_payload -> 'stages', '[]'::jsonb);
    v_count := jsonb_array_length(v_stages);
    if v_count < 1 or v_count > 30 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'A workflow needs between 1 and 30 stages.');
    end if;
    select count(*) into v_outputs from jsonb_array_elements(v_stages) s where (s ->> 'counts_output')::boolean;
    if v_outputs <> 1 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Mark exactly one stage as the finished-output stage.');
    end if;

    if v_exists then
      -- Someone else saved this workflow since this device loaded it.
      if v_current.version <> coalesce((p_payload ->> 'baseVersion')::integer, 0) then
        return jsonb_build_object('status', 'conflict', 'reason', 'workflow_changed', 'row', to_jsonb(v_current) - 'txid');
      end if;
      update public.workflows set name = btrim(p_payload ->> 'name'), description = nullif(btrim(p_payload ->> 'description'), '')
      where id = p_entity returning * into v_row;
    else
      v_limit := private.plan_limit(p_tenant, 'workflows');
      if v_limit is not null and (select count(*) from public.workflows
          where tenant_id = p_tenant and deleted_at is null and archived_at is null) >= v_limit then
        return jsonb_build_object('status', 'rejected', 'reason', 'plan_limit', 'message',
          format('Your plan allows %s workflows. Archive one or upgrade to add more.', v_limit));
      end if;
      insert into public.workflows (id, tenant_id, name, description)
      values (p_entity, p_tenant, btrim(p_payload ->> 'name'), nullif(btrim(p_payload ->> 'description'), ''))
      returning * into v_row;
    end if;

    for v_stage in select value from jsonb_array_elements(v_stages) loop
      v_ids := v_ids || (v_stage ->> 'id')::uuid;
      insert into public.workflow_stages (id, tenant_id, workflow_id, name, position, counts_output)
      values ((v_stage ->> 'id')::uuid, p_tenant, p_entity, btrim(v_stage ->> 'name'),
              (v_stage ->> 'position')::smallint, coalesce((v_stage ->> 'counts_output')::boolean, false))
      on conflict (id) do update
        set name = excluded.name, position = excluded.position, counts_output = excluded.counts_output, deleted_at = null
        where public.workflow_stages.workflow_id = p_entity and public.workflow_stages.tenant_id = p_tenant;
    end loop;
    update public.workflow_stages set deleted_at = now()
    where workflow_id = p_entity and tenant_id = p_tenant and deleted_at is null and not (id = any (v_ids));
  end if;

  return jsonb_build_object('status', 'applied', 'row', to_jsonb(v_row) - 'txid', 'related', jsonb_build_object(
    'workflow_stages', (select coalesce(jsonb_agg(to_jsonb(s) - 'txid' order by s.position), '[]'::jsonb)
                        from public.workflow_stages s where s.workflow_id = p_entity)));
end;
$$;

-- -----------------------------------------------------------------------------
-- Job mutations
-- -----------------------------------------------------------------------------
create function private.next_job_number(p_tenant uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_number integer;
begin
  update public.tenant_settings set next_job_number = next_job_number + 1
  where tenant_id = p_tenant
  returning job_prefix, next_job_number - 1 into v_prefix, v_number;
  return v_prefix || '-' || lpad(v_number::text, 4, '0');
end;
$$;

create function private.job_result(p_job uuid, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', 'applied',
    'row', (select to_jsonb(j) - 'txid' from public.job_orders j where j.id = p_job),
    'related', jsonb_build_object(
      'job_stages', (select coalesce(jsonb_agg(to_jsonb(s) - 'txid' order by s.position), '[]'::jsonb) from public.job_stages s where s.job_id = p_job),
      'job_events', (select coalesce(jsonb_agg(to_jsonb(e) - 'txid' order by e.created_at), '[]'::jsonb) from public.job_events e where e.job_id = p_job)
    )) || p_extra;
$$;

create function private.apply_job_mutation(p_tenant uuid, p_type text, p_entity uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_job public.job_orders%rowtype;
  v_changes jsonb := coalesce(p_payload -> 'changes', '{}'::jsonb);
  v_base jsonb := coalesce(p_payload -> 'base', '{}'::jsonb);
  v_current jsonb;
  v_merged jsonb := '{}'::jsonb;
  v_conflicts text[] := array[]::text[];
  v_key text;
  v_stage jsonb;
  v_stage_row public.job_stages%rowtype;
  v_to text;
  v_limit integer;
  v_status text;
  v_count integer;
  v_fields text[] := array['title', 'product_description', 'quantity', 'unit', 'due_date', 'priority', 'notes', 'instructions', 'customer_id'];
begin
  -- ----- create -----
  if p_type = 'job.create' then
    perform private.require(p_tenant, 'jobs.manage');
    if exists (select 1 from public.job_orders where id = p_entity and tenant_id = p_tenant) then
      return private.job_result(p_entity);
    end if;
    if exists (select 1 from public.job_orders where id = p_entity) then
      return jsonb_build_object('status', 'rejected', 'reason', 'duplicate', 'message', 'This record already exists.');
    end if;
    if not exists (select 1 from public.customers where id = (v_changes ->> 'customer_id')::uuid and tenant_id = p_tenant and deleted_at is null) then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Choose a customer for this job.');
    end if;
    if (v_changes ->> 'workflow_id') is not null and not exists (
        select 1 from public.workflows where id = (v_changes ->> 'workflow_id')::uuid and tenant_id = p_tenant) then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'The workflow for this job no longer exists.');
    end if;
    v_count := jsonb_array_length(coalesce(p_payload -> 'stages', '[]'::jsonb));
    if v_count < 1 or v_count > 30 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'A job needs between 1 and 30 stages.');
    end if;
    v_status := coalesce(v_changes ->> 'status', 'draft');
    if v_status not in ('draft', 'approved') then
      v_status := 'draft';
    end if;
    v_limit := private.plan_limit(p_tenant, 'open_jobs');
    if v_limit is not null and (select count(*) from public.job_orders where tenant_id = p_tenant and deleted_at is null
        and status not in ('completed', 'delivered', 'cancelled')) >= v_limit then
      return jsonb_build_object('status', 'rejected', 'reason', 'plan_limit', 'message',
        format('Your plan allows %s open jobs. Complete some or upgrade to add more.', v_limit));
    end if;

    insert into public.job_orders (id, tenant_id, job_number, customer_id, workflow_id, title, product_description, quantity,
      unit, order_date, due_date, priority, status, notes, instructions)
    values (p_entity, p_tenant, private.next_job_number(p_tenant), (v_changes ->> 'customer_id')::uuid,
      (v_changes ->> 'workflow_id')::uuid, btrim(v_changes ->> 'title'), nullif(btrim(v_changes ->> 'product_description'), ''),
      (v_changes ->> 'quantity')::numeric, btrim(v_changes ->> 'unit'), coalesce((v_changes ->> 'order_date')::date, current_date),
      (v_changes ->> 'due_date')::date, coalesce(v_changes ->> 'priority', 'normal'), v_status,
      nullif(btrim(v_changes ->> 'notes'), ''), nullif(btrim(v_changes ->> 'instructions'), ''));

    for v_stage in select value from jsonb_array_elements(p_payload -> 'stages') loop
      insert into public.job_stages (id, tenant_id, job_id, name, position, counts_output)
      values ((v_stage ->> 'id')::uuid, p_tenant, p_entity, btrim(v_stage ->> 'name'), (v_stage ->> 'position')::smallint,
              coalesce((v_stage ->> 'counts_output')::boolean, false));
    end loop;
    insert into public.job_events (tenant_id, job_id, kind, to_status, actor_name)
    values (p_tenant, p_entity, 'created', v_status, private.actor_name());
    return private.job_result(p_entity);
  end if;

  select * into v_job from public.job_orders where id = p_entity and tenant_id = p_tenant for update;
  if not found then
    if not private.is_member(p_tenant) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This job no longer exists.');
  end if;

  -- ----- edit details (field merge) -----
  if p_type = 'job.update' then
    perform private.require(p_tenant, 'jobs.manage');
    v_current := to_jsonb(v_job);
    for v_key in select jsonb_object_keys(v_changes) loop
      continue when not (v_key = any (v_fields));
      if private.same_field(v_current, v_base, v_key) or private.same_field(v_current, v_changes, v_key) then
        v_merged := v_merged || jsonb_build_object(v_key, v_changes -> v_key);
      else
        v_conflicts := v_conflicts || v_key;
      end if;
    end loop;
    if v_merged ? 'customer_id' and not exists (select 1 from public.customers
        where id = (v_merged ->> 'customer_id')::uuid and tenant_id = p_tenant) then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Choose a customer for this job.');
    end if;
    if v_merged <> '{}'::jsonb then
      update public.job_orders j set
        title = case when v_merged ? 'title' then btrim(v_merged ->> 'title') else j.title end,
        product_description = case when v_merged ? 'product_description' then nullif(btrim(v_merged ->> 'product_description'), '') else j.product_description end,
        quantity = case when v_merged ? 'quantity' then (v_merged ->> 'quantity')::numeric else j.quantity end,
        unit = case when v_merged ? 'unit' then btrim(v_merged ->> 'unit') else j.unit end,
        due_date = case when v_merged ? 'due_date' then (v_merged ->> 'due_date')::date else j.due_date end,
        priority = case when v_merged ? 'priority' then v_merged ->> 'priority' else j.priority end,
        notes = case when v_merged ? 'notes' then nullif(btrim(v_merged ->> 'notes'), '') else j.notes end,
        instructions = case when v_merged ? 'instructions' then nullif(btrim(v_merged ->> 'instructions'), '') else j.instructions end,
        customer_id = case when v_merged ? 'customer_id' then (v_merged ->> 'customer_id')::uuid else j.customer_id end
      where j.id = p_entity;
    end if;
    if cardinality(v_conflicts) > 0 then
      return private.job_result(p_entity, jsonb_build_object('status', 'conflict', 'reason', 'same_field', 'fields', to_jsonb(v_conflicts)));
    end if;
    return private.job_result(p_entity);
  end if;

  -- ----- status move -----
  if p_type = 'job.transition' then
    perform private.require(p_tenant, 'jobs.transition');
    v_to := p_payload ->> 'to';
    if v_job.status = v_to then
      return private.job_result(p_entity);
    end if;
    -- Reopening a cancelled or completed job is for owners and admins.
    if (v_job.status, v_to) in (('cancelled', 'draft'), ('completed', 'in_production'))
       and not private.has_permission(p_tenant, 'members.manage') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_job.status = 'on_hold' and v_to in ('approved', 'in_production') and v_job.held_from is not null and v_to <> v_job.held_from then
      v_to := v_job.held_from;
    end if;
    if not private.job_move_allowed(v_job.status, v_to) then
      return private.job_result(p_entity, jsonb_build_object('status', 'conflict', 'reason', 'invalid_transition',
        'message', format('This job is now %s, so it cannot move to %s.', replace(v_job.status, '_', ' '), replace(v_to, '_', ' '))));
    end if;
    if v_to = 'cancelled' and char_length(btrim(coalesce(p_payload ->> 'reason', ''))) < 3 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Give a reason for cancelling the job.');
    end if;
    update public.job_orders set
      status = v_to,
      held_from = case when v_to = 'on_hold' then v_job.status else null end,
      completed_at = case when v_to = 'completed' then now() when v_to in ('in_production', 'draft') then null else completed_at end
    where id = p_entity;
    insert into public.job_events (tenant_id, job_id, kind, from_status, to_status, reason, actor_name)
    values (p_tenant, p_entity, 'status', v_job.status, v_to, nullif(btrim(p_payload ->> 'reason'), ''), private.actor_name());
    return private.job_result(p_entity);
  end if;

  -- ----- stage step -----
  if p_type = 'job.stage' then
    perform private.require(p_tenant, 'jobs.transition');
    select * into v_stage_row from public.job_stages
    where id = (p_payload ->> 'stageId')::uuid and job_id = p_entity for update;
    if not found then
      return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This stage no longer exists.');
    end if;
    if v_job.status not in ('approved', 'in_production') then
      return private.job_result(p_entity, jsonb_build_object('status', 'conflict', 'reason', 'job_not_active',
        'message', format('This job is %s, so its stages cannot change.', replace(v_job.status, '_', ' '))));
    end if;
    v_to := case p_payload ->> 'action'
      when 'start' then 'in_progress' when 'complete' then 'done' when 'skip' then 'skipped' when 'reopen' then 'in_progress' end;
    if v_to is null then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Unknown stage step.');
    end if;
    if v_stage_row.status = v_to then
      return private.job_result(p_entity);
    end if;
    if not ((p_payload ->> 'action') = 'start' and v_stage_row.status = 'not_started'
         or (p_payload ->> 'action') = 'complete' and v_stage_row.status in ('not_started', 'in_progress')
         or (p_payload ->> 'action') = 'skip' and v_stage_row.status = 'not_started'
         or (p_payload ->> 'action') = 'reopen' and v_stage_row.status in ('done', 'skipped')) then
      return private.job_result(p_entity, jsonb_build_object('status', 'conflict', 'reason', 'stage_changed',
        'message', format('%s is already %s.', v_stage_row.name, replace(v_stage_row.status, '_', ' '))));
    end if;
    update public.job_stages set
      status = v_to,
      started_at = case when v_to = 'in_progress' then coalesce(started_at, now()) else started_at end,
      completed_at = case when v_to in ('done', 'skipped') then now() else null end
    where id = v_stage_row.id;
    insert into public.job_events (tenant_id, job_id, kind, stage_name, stage_action, actor_name)
    values (p_tenant, p_entity, 'stage', v_stage_row.name, p_payload ->> 'action', private.actor_name());
    -- First work on an approved job puts it into production.
    if v_job.status = 'approved' then
      update public.job_orders set status = 'in_production' where id = p_entity;
      insert into public.job_events (tenant_id, job_id, kind, from_status, to_status, actor_name)
      values (p_tenant, p_entity, 'status', 'approved', 'in_production', private.actor_name());
    end if;
    return private.job_result(p_entity);
  end if;

  return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
end;
$$;

-- -----------------------------------------------------------------------------
-- Dispatcher and pull, now covering every synced table
-- -----------------------------------------------------------------------------
create or replace function private.apply_mutation(p_tenant uuid, p_mutation jsonb) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_type text := p_mutation ->> 'type';
  v_entity uuid := (p_mutation ->> 'entityId')::uuid;
  v_payload jsonb := coalesce(p_mutation -> 'payload', '{}'::jsonb);
begin
  if v_type like 'customer.%' then
    return private.apply_customer_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  if v_type in ('employee.create', 'employee.update', 'employee.delete') then
    if not private.has_permission(p_tenant, 'employees.manage') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return private.apply_record_mutation(p_tenant, 'employees', array['name', 'employee_code', 'phone', 'is_active'],
      split_part(v_type, '.', 2), v_entity, v_payload);
  end if;
  if v_type in ('workflow.save', 'workflow.archive') then
    return private.apply_workflow_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  if v_type like 'job.%' then
    return private.apply_job_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
end;
$$;

create or replace function public.sync_pull(p_tenant uuid, p_cursor jsonb default '{}'::jsonb, p_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tables text[] := array['customers', 'employees', 'workflows', 'workflow_stages', 'job_orders', 'job_stages', 'job_events'];
  v_table text;
  v_since xid8 := coalesce(p_cursor ->> 'since', '0')::xid8;
  v_until xid8 := coalesce((p_cursor ->> 'until')::xid8, pg_snapshot_xmin(pg_current_snapshot()));
  v_pos jsonb := coalesce(p_cursor -> 'pos', '{}'::jsonb);
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_rows jsonb;
  v_out jsonb := '{}'::jsonb;
  v_more boolean := false;
  v_count integer;
  v_after_txid xid8;
  v_after_id uuid;
  v_last jsonb;
begin
  if auth.uid() is null or not private.is_member(p_tenant) then
    raise exception 'You are not a member of this business.' using errcode = '42501', hint = 'forbidden';
  end if;

  foreach v_table in array v_tables loop
    v_after_txid := coalesce(v_pos -> v_table ->> 0, '0')::xid8;
    v_after_id := coalesce(v_pos -> v_table ->> 1, '00000000-0000-0000-0000-000000000000')::uuid;
    execute format(
      'select coalesce(jsonb_agg(r order by r_txid, r_id), ''[]''::jsonb), count(*)
         from (select to_jsonb(t) - ''txid'' || jsonb_build_object(''_txid'', t.txid::text) as r,
                      t.txid as r_txid, t.id as r_id
                 from public.%I t
                where t.tenant_id = $1 and t.txid >= $2 and (t.txid, t.id) > ($3, $4)
                order by t.txid, t.id
                limit $5) page',
      v_table)
    into v_rows, v_count
    using p_tenant, v_since, v_after_txid, v_after_id, v_limit;

    v_out := v_out || jsonb_build_object(v_table, v_rows);
    if v_count = v_limit then
      v_more := true;
    end if;
    if v_count > 0 then
      v_last := v_rows -> (v_count - 1);
      v_pos := v_pos || jsonb_build_object(v_table, jsonb_build_array(v_last ->> '_txid', v_last ->> 'id'));
    end if;
  end loop;

  return jsonb_build_object(
    'rows', v_out,
    'hasMore', v_more,
    'cursor', case when v_more
      then jsonb_build_object('since', v_since::text, 'until', v_until::text, 'pos', v_pos)
      else jsonb_build_object('since', v_until::text) end,
    'serverTime', now());
end;
$$;

-- Execute rights: only the authenticated role, only what the sync path needs.
revoke execute on function
  private.apply_record_mutation(uuid, text, text[], text, uuid, jsonb),
  private.require(uuid, text),
  private.actor_name(),
  private.job_move_allowed(text, text),
  private.same_field(jsonb, jsonb, text),
  private.apply_workflow_mutation(uuid, text, uuid, jsonb),
  private.next_job_number(uuid),
  private.job_result(uuid, jsonb),
  private.apply_job_mutation(uuid, text, uuid, jsonb)
from public;
grant execute on function
  private.apply_record_mutation(uuid, text, text[], text, uuid, jsonb),
  private.apply_workflow_mutation(uuid, text, uuid, jsonb),
  private.apply_job_mutation(uuid, text, uuid, jsonb),
  private.job_move_allowed(text, text),
  private.same_field(jsonb, jsonb, text)
to authenticated;
