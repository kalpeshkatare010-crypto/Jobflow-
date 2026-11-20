-- =============================================================================
-- JobFlow migration 0003: customers (first synced entity) and the sync protocol
--
-- Devices send "mutations" (intentions such as customer.update) with a unique
-- mutation id. sync_push applies each one at most once and remembers the
-- result, so retries after a lost connection never duplicate anything.
-- sync_pull returns rows changed since the device's checkpoint using the
-- writing transaction id (xid8), which is commit-safe (DECISIONS.md C-01).
--
-- Both functions are SECURITY INVOKER: they run with the caller's rights, so
-- Row Level Security decides every row they read or write.
-- =============================================================================

create table public.customers (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  business_name text check (char_length(business_name) <= 160),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 30),
  address text check (char_length(address) <= 500),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  notes text check (char_length(notes) <= 2000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id()
);

create index customers_sync on public.customers (tenant_id, txid, id);
create index customers_name on public.customers (tenant_id, lower(name)) where deleted_at is null;
create index employees_sync_page on public.employees (tenant_id, txid, id);

create trigger customers_stamp before insert or update on public.customers
  for each row execute function private.stamp_tenant_row();

revoke all on public.customers from anon, authenticated;
grant select on public.customers to authenticated;
grant insert (id, tenant_id, name, business_name, email, phone, address, gstin, notes) on public.customers to authenticated;
grant update (name, business_name, email, phone, address, gstin, notes, deleted_at) on public.customers to authenticated;

alter table public.customers enable row level security;
create policy customers_read on public.customers for select to authenticated
  using (private.is_member(tenant_id));
create policy customers_insert on public.customers for insert to authenticated
  with check (private.has_permission(tenant_id, 'customers.manage') and private.tenant_can_write(tenant_id));
create policy customers_update on public.customers for update to authenticated
  using (private.has_permission(tenant_id, 'customers.manage'))
  with check (private.has_permission(tenant_id, 'customers.manage') and private.tenant_can_write(tenant_id));

-- -----------------------------------------------------------------------------
-- Idempotency record: one row per mutation ever applied (or refused).
-- -----------------------------------------------------------------------------
create table public.applied_mutations (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  mutation_id uuid not null,
  user_id uuid not null,
  mutation_type text not null,
  result jsonb not null,
  applied_at timestamptz not null default now(),
  primary key (tenant_id, mutation_id)
);

revoke all on public.applied_mutations from anon, authenticated;
grant select, insert on public.applied_mutations to authenticated;
alter table public.applied_mutations enable row level security;
create policy applied_read on public.applied_mutations for select to authenticated
  using (private.is_member(tenant_id));
create policy applied_insert on public.applied_mutations for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(tenant_id));

-- -----------------------------------------------------------------------------
-- Customer mutations
-- -----------------------------------------------------------------------------
create function private.customer_fields() returns text[]
language sql immutable
set search_path = ''
as $$ select array['name', 'business_name', 'email', 'phone', 'address', 'gstin', 'notes'] $$;

-- Text value of a JSON field, keeping JSON null as SQL null.
create function private.jtext(p_obj jsonb, p_key text) returns text
language sql immutable
set search_path = ''
as $$ select case when p_obj ? p_key and jsonb_typeof(p_obj -> p_key) <> 'null' then p_obj ->> p_key end $$;

create function private.apply_customer_mutation(p_tenant uuid, p_type text, p_entity uuid, p_payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row public.customers%rowtype;
  v_changes jsonb := coalesce(p_payload -> 'changes', '{}'::jsonb);
  v_base jsonb := coalesce(p_payload -> 'base', '{}'::jsonb);
  v_current jsonb;
  v_merged jsonb := '{}'::jsonb;
  v_conflicts text[] := array[]::text[];
  v_key text;
begin
  if p_type = 'customer.create' then
    insert into public.customers (id, tenant_id, name, business_name, email, phone, address, gstin, notes)
    values (
      p_entity, p_tenant,
      btrim(private.jtext(v_changes, 'name')),
      private.jtext(v_changes, 'business_name'),
      private.jtext(v_changes, 'email'),
      private.jtext(v_changes, 'phone'),
      private.jtext(v_changes, 'address'),
      upper(private.jtext(v_changes, 'gstin')),
      private.jtext(v_changes, 'notes')
    )
    returning * into v_row;
    return jsonb_build_object('status', 'applied', 'row', to_jsonb(v_row) - 'txid');
  end if;

  -- FOR UPDATE only sees rows the caller may edit (RLS update policy).
  select * into v_row from public.customers where id = p_entity and tenant_id = p_tenant for update;
  if not found then
    if exists (select 1 from public.customers where id = p_entity and tenant_id = p_tenant) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'rejected', 'reason', 'not_found', 'message', 'This customer no longer exists.');
  end if;
  v_current := to_jsonb(v_row);

  if p_type = 'customer.delete' then
    if v_row.deleted_at is not null then
      return jsonb_build_object('status', 'applied', 'row', v_current - 'txid');
    end if;
    -- Someone changed it after this device last saw it: ask a person.
    if v_row.version > coalesce((p_payload ->> 'baseVersion')::integer, 0) then
      return jsonb_build_object('status', 'conflict', 'reason', 'edited_after_delete', 'row', v_current - 'txid');
    end if;
    update public.customers set deleted_at = now() where id = p_entity returning * into v_row;
    if not found then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'applied', 'row', to_jsonb(v_row) - 'txid');
  end if;

  if p_type <> 'customer.update' then
    return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
  end if;
  if v_row.deleted_at is not null then
    return jsonb_build_object('status', 'conflict', 'reason', 'deleted', 'row', v_current - 'txid', 'fields', '[]'::jsonb);
  end if;

  -- Field-level three-way merge: apply a field if the server still has the
  -- value the device started from (or already has the new value).
  for v_key in select jsonb_object_keys(v_changes) loop
    if not (v_key = any (private.customer_fields())) then
      continue;
    end if;
    if private.jtext(v_current, v_key) is not distinct from private.jtext(v_base, v_key)
       or private.jtext(v_current, v_key) is not distinct from private.jtext(v_changes, v_key) then
      v_merged := v_merged || jsonb_build_object(v_key, v_changes -> v_key);
    else
      v_conflicts := v_conflicts || v_key;
    end if;
  end loop;

  if v_merged <> '{}'::jsonb then
    update public.customers c set
      name = case when v_merged ? 'name' then btrim(private.jtext(v_merged, 'name')) else c.name end,
      business_name = case when v_merged ? 'business_name' then private.jtext(v_merged, 'business_name') else c.business_name end,
      email = case when v_merged ? 'email' then private.jtext(v_merged, 'email') else c.email end,
      phone = case when v_merged ? 'phone' then private.jtext(v_merged, 'phone') else c.phone end,
      address = case when v_merged ? 'address' then private.jtext(v_merged, 'address') else c.address end,
      gstin = case when v_merged ? 'gstin' then upper(private.jtext(v_merged, 'gstin')) else c.gstin end,
      notes = case when v_merged ? 'notes' then private.jtext(v_merged, 'notes') else c.notes end
    where c.id = p_entity
    returning * into v_row;
    if not found then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if cardinality(v_conflicts) > 0 then
    return jsonb_build_object('status', 'conflict', 'reason', 'same_field', 'fields', to_jsonb(v_conflicts),
                              'row', to_jsonb(v_row) - 'txid');
  end if;
  return jsonb_build_object('status', 'applied', 'row', to_jsonb(v_row) - 'txid');
end;
$$;

create function private.apply_mutation(p_tenant uuid, p_mutation jsonb) returns jsonb
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
  return jsonb_build_object('status', 'rejected', 'reason', 'unknown_type', 'message', 'Unknown change type.');
end;
$$;

grant execute on function
  private.customer_fields(),
  private.jtext(jsonb, text),
  private.apply_customer_mutation(uuid, text, uuid, jsonb),
  private.apply_mutation(uuid, jsonb)
to authenticated;

-- -----------------------------------------------------------------------------
-- sync_push: apply a batch of mutations in order, each at most once.
-- Returns one result per mutation: applied | conflict | rejected.
-- -----------------------------------------------------------------------------
create function public.sync_push(p_tenant uuid, p_mutations jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mutation jsonb;
  v_id uuid;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_state text;
  v_message text;
  v_hint text;
begin
  if auth.uid() is null or not private.is_member(p_tenant) then
    raise exception 'You are not a member of this business.' using errcode = '42501', hint = 'forbidden';
  end if;
  if jsonb_typeof(p_mutations) <> 'array' or jsonb_array_length(p_mutations) > 200 then
    raise exception 'Send between 1 and 200 changes at a time.' using errcode = 'P0001', hint = 'invalid_batch';
  end if;

  for v_mutation in select value from jsonb_array_elements(p_mutations) loop
    v_id := (v_mutation ->> 'mutationId')::uuid;
    -- Two requests carrying the same mutation queue up here instead of racing.
    perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || v_id::text, 0));

    select am.result into v_result from public.applied_mutations am
    where am.tenant_id = p_tenant and am.mutation_id = v_id;

    if not found then
      begin
        v_result := private.apply_mutation(p_tenant, v_mutation);
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_message = message_text, v_hint = pg_exception_hint;
        v_result := jsonb_build_object(
          'status', 'rejected',
          'reason', case
            when v_state = '42501' and not private.tenant_can_write(p_tenant) then 'read_only'
            when v_state = '42501' then 'forbidden'
            when v_state = '23505' then 'duplicate'
            when v_state in ('23514', '23502', '22001', '22P02') then 'invalid'
            else 'error' end,
          'message', case
            when v_state = '42501' and not private.tenant_can_write(p_tenant) then 'This workspace is read-only until the subscription is renewed.'
            when v_state = '42501' then 'You do not have permission to make this change.'
            when v_state = '23505' then 'This record already exists.'
            when v_state in ('23514', '23502', '22001', '22P02') then 'Some details are missing or not valid.'
            else 'The server could not apply this change.' end,
          'detail', v_message);
      end;
      v_result := v_result || jsonb_build_object('mutationId', v_id);
      insert into public.applied_mutations (tenant_id, mutation_id, user_id, mutation_type, result)
      values (p_tenant, v_id, auth.uid(), coalesce(v_mutation ->> 'type', ''), v_result);
    end if;

    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return v_results;
end;
$$;

-- -----------------------------------------------------------------------------
-- sync_pull: rows changed since the device's checkpoint, page by page.
--
-- Cursor (JSON, opaque to the app):
--   since  - checkpoint: rows whose writing transaction id >= since
--   until  - the next checkpoint, fixed when this pull session started:
--            the oldest transaction still running at that moment
--   pos    - per table, the last (txid, id) already sent in this session
-- A finished session returns {since: until}. Transactions still running when
-- the session started have txid >= until, so they are fetched next time.
-- Rows can arrive twice, never zero times; the app's merge is idempotent.
-- -----------------------------------------------------------------------------
create function public.sync_pull(p_tenant uuid, p_cursor jsonb default '{}'::jsonb, p_limit integer default 500)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tables text[] := array['customers', 'employees'];
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

revoke execute on function public.sync_push(uuid, jsonb), public.sync_pull(uuid, jsonb, integer) from public, anon;
grant execute on function public.sync_push(uuid, jsonb), public.sync_pull(uuid, jsonb, integer) to authenticated;
