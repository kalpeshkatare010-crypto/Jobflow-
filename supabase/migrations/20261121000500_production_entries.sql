-- JobFlow migration 0005: production entries (Milestone 7)
--
-- A production entry records good and rejected quantity for one stage of one
-- job, on one day, optionally by one employee. Entries are append-only: a
-- mistake is corrected by voiding the entry with a reason (kept for audit),
-- never by editing or deleting it. Offline entries from several phones simply
-- add up, so they never conflict with each other.

create table public.production_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  job_id uuid not null,
  job_stage_id uuid not null,
  employee_id uuid,
  entry_date date not null,
  good_qty numeric(14, 3) not null default 0 check (good_qty >= 0 and good_qty <= 1000000000),
  rejected_qty numeric(14, 3) not null default 0 check (rejected_qty >= 0 and rejected_qty <= 1000000000),
  rejection_reason text check (char_length(rejection_reason) <= 200),
  notes text check (char_length(notes) <= 500),
  recorded_by_name text,
  voided_at timestamptz,
  void_reason text check (char_length(void_reason) <= 300),
  voided_by_name text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  check (good_qty + rejected_qty > 0),
  check (rejected_qty = 0 or char_length(btrim(coalesce(rejection_reason, ''))) >= 2),
  foreign key (job_id, tenant_id) references public.job_orders (id, tenant_id)
);
create index production_entries_sync on public.production_entries (tenant_id, txid, id);
create index production_entries_job on public.production_entries (job_id, job_stage_id);
create index production_entries_date on public.production_entries (tenant_id, entry_date);
create trigger production_entries_stamp before insert or update on public.production_entries
  for each row execute function private.stamp_tenant_row();

revoke all on public.production_entries from anon, authenticated;
grant select on public.production_entries to authenticated;
alter table public.production_entries enable row level security;
create policy production_entries_read on public.production_entries for select to authenticated
  using (private.is_member(tenant_id));

-- -----------------------------------------------------------------------------
-- Writes
-- -----------------------------------------------------------------------------
create function private.production_result(p_entry uuid, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  -- The entry, plus its job (status may have moved) with stages and history.
  select jsonb_build_object(
      'status', 'applied',
      'row', to_jsonb(e) - 'txid',
      'related', (x.r -> 'related') || jsonb_build_object('job_orders', jsonb_build_array(x.r -> 'row')))
    || p_extra
  from public.production_entries e
  cross join lateral (select private.job_result(e.job_id) as r) x
  where e.id = p_entry;
$$;

create function private.apply_production_mutation(p_tenant uuid, p_type text, p_entity uuid, p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entry public.production_entries%rowtype;
  v_job public.job_orders%rowtype;
  v_stage public.job_stages%rowtype;
  v_good numeric;
  v_rejected numeric;
  v_date date;
  v_employee uuid;
  v_reason text;
begin
  -- ----- record -----
  if p_type = 'production.record' then
    -- Employees record by default (D-22); others need the production permission.
    if not (private.has_permission(p_tenant, 'production.record')
            or private.has_permission(p_tenant, 'production.record.assigned')) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if not private.tenant_can_write(p_tenant) then
      raise exception 'read only' using errcode = '42501', hint = 'read_only';
    end if;

    -- The same queued change sent twice is applied once.
    select * into v_entry from public.production_entries where id = p_entity;
    if found then
      if v_entry.tenant_id <> p_tenant then
        return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'This entry id is already in use.');
      end if;
      return private.production_result(p_entity);
    end if;

    begin
      v_good := coalesce(nullif(p_payload ->> 'good', ''), '0')::numeric;
      v_rejected := coalesce(nullif(p_payload ->> 'rejected', ''), '0')::numeric;
      v_date := (p_payload ->> 'date')::date;
      v_employee := nullif(p_payload ->> 'employeeId', '')::uuid;
    exception when others then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'The quantities or date are not valid.');
    end;
    v_reason := nullif(btrim(coalesce(p_payload ->> 'reason', '')), '');
    if v_good < 0 or v_rejected < 0 or v_good + v_rejected <= 0 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Enter a good or rejected quantity above zero.');
    end if;
    if v_rejected > 0 and char_length(coalesce(v_reason, '')) < 2 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Give a reason for the rejected quantity.');
    end if;
    if v_date is null or v_date > current_date + 1 or v_date < current_date - 366 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Choose a date within the last year.');
    end if;

    select * into v_job from public.job_orders
    where id = (p_payload ->> 'jobId')::uuid and tenant_id = p_tenant and deleted_at is null for update;
    if not found then
      return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This job no longer exists.');
    end if;
    select * into v_stage from public.job_stages
    where id = (p_payload ->> 'stageId')::uuid and job_id = v_job.id for update;
    if not found then
      return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This stage no longer exists.');
    end if;
    if v_employee is not null and not exists (
      select 1 from public.employees where id = v_employee and tenant_id = p_tenant and deleted_at is null) then
      v_employee := null;
    end if;
    -- Work recorded offline is real work, so late entries on completed or
    -- delivered jobs are kept. Drafts and cancelled jobs take no production.
    if v_job.status in ('draft', 'cancelled') then
      return jsonb_build_object('status', 'conflict', 'reason', 'job_not_active',
        'message', format('This job is %s, so the entry (%s good, %s rejected at %s) was not recorded.',
          v_job.status, v_good, v_rejected, v_stage.name));
    end if;

    insert into public.production_entries (id, tenant_id, job_id, job_stage_id, employee_id, entry_date,
      good_qty, rejected_qty, rejection_reason, notes, recorded_by_name)
    values (p_entity, p_tenant, v_job.id, v_stage.id, v_employee, v_date, v_good, v_rejected,
      case when v_rejected > 0 then left(v_reason, 200) end,
      left(nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''), 500), private.actor_name());

    -- Recording work starts the stage, and puts an approved job into production.
    if v_stage.status = 'not_started' then
      update public.job_stages set status = 'in_progress', started_at = coalesce(started_at, now()) where id = v_stage.id;
      insert into public.job_events (tenant_id, job_id, kind, stage_name, stage_action, actor_name)
      values (p_tenant, v_job.id, 'stage', v_stage.name, 'start', private.actor_name());
    end if;
    if v_job.status = 'approved' then
      update public.job_orders set status = 'in_production' where id = v_job.id;
      insert into public.job_events (tenant_id, job_id, kind, from_status, to_status, actor_name)
      values (p_tenant, v_job.id, 'status', 'approved', 'in_production', private.actor_name());
    end if;
    return private.production_result(p_entity);
  end if;

  -- ----- void -----
  if p_type = 'production.void' then
    perform private.require(p_tenant, 'production.override');
    select * into v_entry from public.production_entries where id = p_entity and tenant_id = p_tenant for update;
    if not found then
      return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This entry no longer exists.');
    end if;
    if v_entry.voided_at is not null then
      return private.production_result(p_entity);
    end if;
    v_reason := btrim(coalesce(p_payload ->> 'reason', ''));
    if char_length(v_reason) < 3 then
      return jsonb_build_object('status', 'rejected', 'reason', 'invalid', 'message', 'Give a reason for voiding the entry.');
    end if;
    update public.production_entries
    set voided_at = now(), void_reason = left(v_reason, 300), voided_by_name = private.actor_name(), version = version + 1
    where id = p_entity;
    return private.production_result(p_entity);
  end if;

  return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
end;
$$;

-- -----------------------------------------------------------------------------
-- Dispatcher and pull now include production entries
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
  if v_type in ('production.record', 'production.void') then
    return private.apply_production_mutation(p_tenant, v_type, v_entity, v_payload);
  end if;
  return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
end;
$$;

-- sync_pull reads its table list from this function so later milestones add tables in one place.
create function private.synced_tables() returns text[]
language sql immutable
set search_path = ''
as $$
  select array['customers', 'employees', 'workflows', 'workflow_stages', 'job_orders', 'job_stages', 'job_events',
               'production_entries'];
$$;

create or replace function public.sync_pull(p_tenant uuid, p_cursor jsonb default '{}'::jsonb, p_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tables text[] := private.synced_tables();
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

revoke execute on function
  private.production_result(uuid, jsonb),
  private.apply_production_mutation(uuid, text, uuid, jsonb),
  private.synced_tables()
from public;
grant execute on function
  private.production_result(uuid, jsonb),
  private.apply_production_mutation(uuid, text, uuid, jsonb),
  private.synced_tables()
to authenticated;
