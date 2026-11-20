-- =============================================================================
-- JobFlow migration 0001: tenancy, roles, permissions and Row Level Security
--
-- Security model (see DECISIONS.md C-05, C-06):
--   * Every business table carries tenant_id and has RLS enabled.
--   * The browser only ever uses the "authenticated" role. It gets column-level
--     grants for the fields people may edit; protected fields (plan,
--     subscription, job counters, roles) change only through checked RPCs.
--   * Helper functions live in schema "private", which the API does not expose.
--     They are SECURITY DEFINER with an empty search_path and fully qualified
--     names, and only the specific helpers used by policies are executable.
--   * No hard deletes from the app: rows are soft-deleted with deleted_at.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'production_manager', 'employee');
create type public.member_status as enum ('invited', 'active', 'revoked');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');

-- -----------------------------------------------------------------------------
-- Row stamping. Clients never set version, timestamps, authors or txid.
-- txid (xid8) is the commit-safe sync cursor (DECISIONS.md C-01).
-- -----------------------------------------------------------------------------
create function private.stamp_tenant_row() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    -- Identity and ownership of a row can never change.
    new.id := old.id;
    new.tenant_id := old.tenant_id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.txid := pg_catalog.pg_current_xact_id();
  return new;
end;
$$;

create function private.stamp_root_row() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.txid := pg_catalog.pg_current_xact_id();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Plans (prices fixed by the owner: DECISIONS.md D-01). Amounts in paise.
-- A null limit means unlimited.
-- -----------------------------------------------------------------------------
create table public.plans (
  code text primary key,
  name text not null,
  price_inr_paise integer not null check (price_inr_paise >= 0),
  limits jsonb not null,
  sort_order smallint not null default 0
);

insert into public.plans (code, name, price_inr_paise, limits, sort_order) values
  ('starter', 'Starter', 29900, '{"logins": 3, "employees": 15, "workflows": 2, "open_jobs": 100}', 1),
  ('professional', 'Professional', 59900, '{"logins": 10, "employees": null, "workflows": null, "open_jobs": null}', 2);

-- -----------------------------------------------------------------------------
-- Tenants (one row per business)
-- -----------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  country text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) between 3 and 64),
  plan_code text not null default 'starter' references public.plans (code),
  subscription_status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  current_period_end timestamptz,
  offline_grace_days smallint not null default 7 check (offline_grace_days between 0 and 30),
  is_demo boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id()
);

create trigger tenants_stamp before insert or update on public.tenants
  for each row execute function private.stamp_root_row();

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  job_prefix text not null default 'JOB' check (job_prefix ~ '^[A-Z0-9-]{1,10}$'),
  next_job_number integer not null default 1 check (next_job_number > 0),
  units text[] not null default array['pcs', 'kg', 'g', 'm', 'mm', 'l', 'set', 'box', 'roll', 'sheet'],
  logo_path text,
  display_address text check (char_length(display_address) <= 500),
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  contact_phone text check (char_length(contact_phone) <= 30),
  contact_email text check (char_length(contact_email) <= 200),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  txid xid8 not null default pg_current_xact_id()
);

create function private.stamp_settings_row() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.tenant_id := old.tenant_id;
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.txid := pg_catalog.pg_current_xact_id();
  return new;
end;
$$;

create trigger tenant_settings_stamp before insert or update on public.tenant_settings
  for each row execute function private.stamp_settings_row();

-- -----------------------------------------------------------------------------
-- People
-- -----------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text check (char_length(phone) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  status public.member_status not null default 'active',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  unique (tenant_id, user_id),
  unique (id, tenant_id)
);

-- Exactly one active owner per business.
create unique index memberships_one_owner on public.memberships (tenant_id)
  where role = 'owner' and status = 'active' and deleted_at is null;
create index memberships_user on public.memberships (user_id) where status = 'active';
create index memberships_sync on public.memberships (tenant_id, txid);

create trigger memberships_stamp before insert or update on public.memberships
  for each row execute function private.stamp_tenant_row();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz,
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index invitations_tenant on public.invitations (tenant_id) where accepted_at is null and revoked_at is null;

-- Shop-floor roster: workers need no login (DECISIONS.md D-07).
create table public.employees (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  employee_code text check (char_length(employee_code) <= 30),
  phone text check (char_length(phone) <= 30),
  membership_id uuid,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  txid xid8 not null default pg_current_xact_id(),
  -- A linked login must belong to the same business.
  foreign key (membership_id, tenant_id) references public.memberships (id, tenant_id)
);
create unique index employees_code on public.employees (tenant_id, lower(employee_code))
  where employee_code is not null and deleted_at is null;
create index employees_sync on public.employees (tenant_id, txid);

create trigger employees_stamp before insert or update on public.employees
  for each row execute function private.stamp_tenant_row();

-- -----------------------------------------------------------------------------
-- Authorisation helpers (used by policies and RPCs)
-- -----------------------------------------------------------------------------
create function private.is_member(p_tenant uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
  );
$$;

create function private.member_role(p_tenant uuid) returns public.member_role
language sql stable security definer
set search_path = ''
as $$
  select m.role from public.memberships m
  where m.tenant_id = p_tenant and m.user_id = auth.uid()
    and m.status = 'active' and m.deleted_at is null;
$$;

-- Default permissions per role. Owners and admins may switch individual
-- permissions on for an employee through memberships.permissions.
create function private.role_allows(p_role public.member_role, p_permission text) returns boolean
language sql immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then true
    when 'admin' then p_permission <> 'billing.manage'
    when 'production_manager' then p_permission = any (array[
      'employees.manage', 'customers.manage', 'workflows.manage', 'jobs.manage', 'jobs.assign',
      'jobs.transition', 'production.record', 'production.override', 'inventory.manage',
      'inventory.consume', 'reports.view', 'conflicts.resolve'])
    when 'employee' then p_permission = any (array[
      'production.record.assigned', 'jobs.transition.assigned', 'inventory.consume.assigned'])
    else false
  end;
$$;

create function private.has_permission(p_tenant uuid, p_permission text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select private.role_allows(m.role, p_permission)
        or (m.role = 'employee' and coalesce((m.permissions ->> p_permission)::boolean, false))
    from public.memberships m
    where m.tenant_id = p_tenant and m.user_id = auth.uid()
      and m.status = 'active' and m.deleted_at is null
  ), false);
$$;

-- Writes are allowed while the trial or paid period (plus grace) is running.
-- After that the workspace is read-only (DECISIONS.md D-09, C-06).
create function private.tenant_can_write(p_tenant uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select t.deleted_at is null and case t.subscription_status
      when 'trialing' then now() < t.trial_ends_at + make_interval(days => t.offline_grace_days)
      when 'active' then true
      when 'past_due' then now() < coalesce(t.current_period_end, now()) + make_interval(days => t.offline_grace_days)
      else false
    end
    from public.tenants t where t.id = p_tenant
  ), false);
$$;

create function private.shares_tenant_with(p_user uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.tenant_id = mine.tenant_id
    where mine.user_id = auth.uid() and mine.status = 'active' and mine.deleted_at is null
      and theirs.user_id = p_user and theirs.deleted_at is null
  );
$$;

create function private.plan_limit(p_tenant uuid, p_key text) returns integer
language sql stable security definer
set search_path = ''
as $$
  select (p.limits ->> p_key)::integer
  from public.tenants t join public.plans p on p.code = t.plan_code
  where t.id = p_tenant;
$$;

grant execute on function
  private.is_member(uuid),
  private.member_role(uuid),
  private.role_allows(public.member_role, text),
  private.has_permission(uuid, text),
  private.tenant_can_write(uuid),
  private.shares_tenant_with(uuid)
to authenticated;

-- Plan limit on the employee roster, checked on the server.
create function private.enforce_employee_limit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_limit integer := private.plan_limit(new.tenant_id, 'employees');
  v_count integer;
begin
  if v_limit is null then
    return new;
  end if;
  select count(*) into v_count from public.employees e
  where e.tenant_id = new.tenant_id and e.deleted_at is null and e.is_active;
  if v_count >= v_limit then
    raise exception 'Your plan allows % active employees. Upgrade to add more.', v_limit
      using errcode = 'P0001', hint = 'plan_limit:employees';
  end if;
  return new;
end;
$$;

create trigger employees_limit before insert on public.employees
  for each row execute function private.enforce_employee_limit();

-- -----------------------------------------------------------------------------
-- New sign-ups get a profile row
-- -----------------------------------------------------------------------------
create function private.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Privileges: nothing for anon; column-level writes for authenticated
-- -----------------------------------------------------------------------------
revoke all on public.plans, public.tenants, public.tenant_settings, public.profiles,
  public.memberships, public.invitations, public.employees from anon, authenticated;

grant select on public.plans, public.tenants, public.tenant_settings, public.profiles,
  public.memberships, public.invitations, public.employees to authenticated;

grant update (name, country, currency, timezone) on public.tenants to authenticated;
grant update (job_prefix, units, logo_path, display_address, gstin, contact_phone, contact_email)
  on public.tenant_settings to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert (id, tenant_id, name, employee_code, phone, membership_id, is_active) on public.employees to authenticated;
grant update (name, employee_code, phone, membership_id, is_active, deleted_at) on public.employees to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.employees enable row level security;

create policy plans_read on public.plans for select to authenticated using (true);

create policy tenants_read on public.tenants for select to authenticated
  using (private.is_member(id));
create policy tenants_update on public.tenants for update to authenticated
  using (private.has_permission(id, 'settings.manage'))
  with check (private.has_permission(id, 'settings.manage'));

create policy settings_read on public.tenant_settings for select to authenticated
  using (private.is_member(tenant_id));
create policy settings_update on public.tenant_settings for update to authenticated
  using (private.has_permission(tenant_id, 'settings.manage'))
  with check (private.has_permission(tenant_id, 'settings.manage'));

create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or private.shares_tenant_with(user_id));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Memberships change only through the RPCs below.
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid() or private.is_member(tenant_id));

create policy invitations_read on public.invitations for select to authenticated
  using (private.has_permission(tenant_id, 'members.manage'));

create policy employees_read on public.employees for select to authenticated
  using (private.is_member(tenant_id));
create policy employees_insert on public.employees for insert to authenticated
  with check (private.has_permission(tenant_id, 'employees.manage') and private.tenant_can_write(tenant_id));
create policy employees_update on public.employees for update to authenticated
  using (private.has_permission(tenant_id, 'employees.manage'))
  with check (private.has_permission(tenant_id, 'employees.manage') and private.tenant_can_write(tenant_id));
