-- JobFlow migration 0006: basic inventory (Milestone 8)
--
-- Materials carry an on-hand balance that only the server changes, inside the
-- same transaction that appends a stock movement (decision C-04). Movements are
-- append-only: a mistake is corrected with an adjustment that has a reason.
-- Stock may go below zero (offline phones can issue the same material); the app
-- then shows a warning instead of silently correcting anything.

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  code text check (char_length(code) <= 40),
  unit text not null default 'pcs' check (char_length(btrim(unit)) between 1 and 20),
  category text check (char_length(category) <= 60),
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  on_hand numeric(16, 3) not null default 0,
  notes text check (char_length(notes) <= 500),
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  unique (id, tenant_id)
);
create index materials_sync on public.materials (tenant_id, txid, id);
create unique index materials_code on public.materials (tenant_id, lower(code)) where code is not null and deleted_at is null;
create trigger materials_stamp before insert or update on public.materials
  for each row execute function private.stamp_tenant_row();

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  material_id uuid not null,
  kind text not null check (kind in ('receive', 'issue', 'adjust')),
  -- Signed: positive adds stock, negative removes it.
  qty numeric(14, 3) not null check (qty <> 0 and abs(qty) <= 1000000000),
  balance_after numeric(16, 3) not null,
  job_id uuid,
  movement_date date not null,
  reason text check (char_length(reason) <= 300),
  recorded_by_name text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  foreign key (material_id, tenant_id) references public.materials (id, tenant_id),
  check (kind <> 'adjust' or char_length(btrim(coalesce(reason, ''))) >= 3),
  check (kind <> 'receive' or qty > 0),
  check (kind <> 'issue' or qty < 0)
);
create index stock_movements_sync on public.stock_movements (tenant_id, txid, id);
create index stock_movements_material on public.stock_movements (material_id, created_at);
create trigger stock_movements_stamp before insert or update on public.stock_movements
  for each row execute function private.stamp_tenant_row();

revoke all on public.materials, public.stock_movements from anon, authenticated;
grant select on public.materials, public.stock_movements to authenticated;
-- Materials are edited through the generic sync function, which runs with the
-- caller's rights: only these columns, and never on_hand.
grant insert (id, tenant_id, name, code, unit, category, min_stock, notes, is_active) on public.materials to authenticated;
grant update (name, code, unit, category, min_stock, notes, is_active, deleted_at) on public.materials to authenticated;
alter table public.materials enable row level security;
alter table public.stock_movements enable row level security;
create policy materials_read on public.materials for select to authenticated using (private.is_member(tenant_id));
create policy materials_insert on public.materials for insert to authenticated
  with check (private.has_permission(tenant_id, 'inventory.manage') and private.tenant_can_write(tenant_id));
create policy materials_update on public.materials for update to authenticated
  using (private.has_permission(tenant_id, 'inventory.manage'))
  with check (private.has_permission(tenant_id, 'inventory.manage') and private.tenant_can_write(tenant_id));
create policy stock_movements_read on public.stock_movements for select to authenticated using (private.is_member(tenant_id));

-- Numbers such as 10 and 10.000 are the same value: compare fields with
-- private.same_field (as jobs do) so quantities never cause false conflicts.
create or replace function private.apply_record_mutation(
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
    if private.same_field(v_current, v_base, v_key)
       or private.same_field(v_current, v_changes, v_key) then
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
-- Stock movements
-- -----------------------------------------------------------------------------
create function private.apply_stock_mutation(p_tenant uuid, p_type text, p_entity uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_existing public.stock_movements%rowtype;
  v_material public.materials%rowtype;
  v_kind text := p_payload ->> 'kind';
  v_qty numeric;
  v_date date;
  v_job uuid;
  v_reason text := nullif(btrim(coalesce(p_payload ->> 'reason', '')), '');
  v_row public.stock_movements%rowtype;
begin
  if p_type <> 'stock.move' then
    return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
  end if;
  if v_kind = 'issue' then
    if not (private.has_permission(p_tenant, 'inventory.consume') or private.has_permission(p_tenant, 'inventory.consume.assigned')
            or private.has_permission(p_tenant, 'inventory.manage')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not private.tenant_can_write(p_tenant) then
      raise exception 'read only' using errcode = '42501', hint = 'read_only';
    end if;
  elsif v_kind in ('receive', 'adjust') then
    perform private.require(p_tenant, 'inventory.manage');
  else
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Choose receive, issue or adjust.');
  end if;

  -- The same queued movement sent twice is applied once.
  select * into v_existing from public.stock_movements where id = p_entity;
  if found then
    if v_existing.tenant_id <> p_tenant then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'This movement id is already in use.');
    end if;
    return jsonb_build_object('status', 'applied', 'row', to_jsonb(v_existing) - 'txid',
      'related', jsonb_build_object('materials',
        (select jsonb_agg(to_jsonb(m) - 'txid') from public.materials m where m.id = v_existing.material_id)));
  end if;

  begin
    v_qty := (p_payload ->> 'qty')::numeric;
    v_date := (p_payload ->> 'date')::date;
    v_job := nullif(p_payload ->> 'jobId', '')::uuid;
  exception when others then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'The quantity or date is not valid.');
  end;
  if v_qty is null or v_qty = 0 or abs(v_qty) > 1000000000 then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Enter a quantity other than zero.');
  end if;
  -- Receive and issue take a positive amount; the sign comes from the kind.
  if v_kind in ('receive', 'issue') then
    if v_qty < 0 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Enter a quantity above zero.');
    end if;
    if v_kind = 'issue' then v_qty := -v_qty; end if;
  end if;
  if v_kind = 'adjust' and char_length(coalesce(v_reason, '')) < 3 then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Give a reason for the adjustment, for example "monthly count".');
  end if;
  if v_date is null or v_date > current_date + 1 or v_date < current_date - 366 then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Choose a date within the last year.');
  end if;
  if v_job is not null and not exists (select 1 from public.job_orders where id = v_job and tenant_id = p_tenant) then
    v_job := null;
  end if;

  -- Atomic balance change: concurrent movements on the same material queue on this row lock.
  update public.materials set on_hand = on_hand + v_qty, version = version + 1
  where id = (p_payload ->> 'materialId')::uuid and tenant_id = p_tenant and deleted_at is null
  returning * into v_material;
  if not found then
    return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This material no longer exists.');
  end if;

  insert into public.stock_movements (id, tenant_id, material_id, kind, qty, balance_after, job_id, movement_date, reason, recorded_by_name)
  values (p_entity, p_tenant, v_material.id, v_kind, v_qty, v_material.on_hand, v_job, v_date, left(v_reason, 300), private.actor_name())
  returning * into v_row;

  return jsonb_build_object('status', 'applied', 'row', to_jsonb(v_row) - 'txid',
    'related', jsonb_build_object('materials', jsonb_build_array(to_jsonb(v_material) - 'txid')));
end;
$$;

-- -----------------------------------------------------------------------------
-- Dispatcher and pull
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
  if v_type in ('material.create', 'material.update', 'material.delete') then
    -- on_hand is not in the list: only stock movements change it. Row Level
    -- Security also checks the permission and read-only mode on every write.
    if not private.has_permission(p_tenant, 'inventory.manage') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return private.apply_record_mutation(p_tenant, 'materials',
      array['name', 'code', 'unit', 'category', 'min_stock', 'notes', 'is_active'],
      split_part(v_type, '.', 2), v_entity, v_payload);
  end if;
  if v_type = 'stock.move' then
    return private.apply_stock_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  if v_type in ('workflow.save', 'workflow.archive') then
    return private.apply_workflow_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  if v_type like 'job.%' then
    return private.apply_job_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  if v_type in ('production.record', 'production.void') then
    return private.apply_production_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
end;
$$;

create or replace function private.synced_tables() returns text[]
language sql immutable
set search_path = ''
as $$
  select array['customers', 'employees', 'workflows', 'workflow_stages', 'job_orders', 'job_stages', 'job_events',
               'production_entries', 'materials', 'stock_movements'];
$$;

revoke execute on function private.apply_stock_mutation(uuid, text, uuid, jsonb) from public;
grant execute on function private.apply_stock_mutation(uuid, text, uuid, jsonb) to authenticated;
