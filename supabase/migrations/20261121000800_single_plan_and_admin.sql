-- JobFlow migration 0008: one plan at Rs 999/month, trial-then-subscribe, admin access
--
-- * A single plan, "JobFlow", Rs 999 per month, no usage limits. Every business moves to it.
-- * After the 14-day free trial a business cannot work in JobFlow until it subscribes
--   (no extra grace week). A paid month keeps working for 3 days after it ends, for
--   late payments. Nothing is ever deleted.
-- * The JobFlow admin (RK Digitals) always has full access and is never asked to pay.
--   Admins are the accounts in private.platform_admins, plus the admin email
--   addresses below once that email is confirmed.

insert into public.plans (code, name, price_inr_paise, limits, sort_order)
values ('standard', 'JobFlow', 99900, '{"logins": null, "employees": null, "workflows": null, "open_jobs": null}', 0)
on conflict (code) do update set name = excluded.name, price_inr_paise = excluded.price_inr_paise, limits = excluded.limits;

update public.tenants set plan_code = 'standard' where plan_code <> 'standard';
alter table public.tenants alter column plan_code set default 'standard';
delete from public.plans where code <> 'standard';

-- Admin email addresses (given by the owner). An address counts only after it is confirmed.
create table private.platform_admin_emails (email text primary key check (email = lower(email)));
revoke all on private.platform_admin_emails from public, anon, authenticated;
insert into private.platform_admin_emails (email) values
  ('kalpeshkatare010@gmail.com'),
  ('kalpeshkatare@hotmail.com')
on conflict do nothing;

create or replace function private.user_is_platform_admin(p_user uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_user is not null and (
    exists (select 1 from private.platform_admins a where a.user_id = p_user)
    or exists (
      select 1 from auth.users u
      join private.platform_admin_emails e on e.email = lower(u.email)
      where u.id = p_user and u.email_confirmed_at is not null)
  );
$$;

create or replace function private.is_platform_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.user_is_platform_admin(auth.uid());
$$;

-- A business run by an admin (owner or admin role) is always on, free of charge.
create function private.tenant_is_complimentary(p_tenant uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = p_tenant and m.status = 'active' and m.deleted_at is null
      and m.role in ('owner', 'admin') and private.user_is_platform_admin(m.user_id));
$$;

create or replace function private.tenant_can_write(p_tenant uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select t.deleted_at is null and (
      private.tenant_is_complimentary(t.id)
      or case t.subscription_status
        when 'trialing' then now() < t.trial_ends_at
        when 'active' then t.current_period_end is null or now() < t.current_period_end + interval '3 days'
        when 'past_due' then now() < coalesce(t.current_period_end, now()) + interval '3 days'
        else false
      end)
    from public.tenants t where t.id = p_tenant
  ), false);
$$;

-- What the app needs to decide whether to open, and what to say. Members only.
create function public.tenant_access(p_tenant uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants%rowtype;
begin
  if not private.is_member(p_tenant) then
    raise exception 'not a member' using errcode = '42501', hint = 'forbidden';
  end if;
  select * into v_tenant from public.tenants where id = p_tenant;
  return jsonb_build_object(
    'canUse', private.tenant_can_write(p_tenant),
    'complimentary', private.tenant_is_complimentary(p_tenant),
    'isAdmin', private.is_platform_admin(),
    'status', v_tenant.subscription_status,
    'trialEndsAt', v_tenant.trial_ends_at,
    'periodEnd', v_tenant.current_period_end,
    'pricePaise', (select price_inr_paise from public.plans where code = v_tenant.plan_code),
    'checkedAt', now());
end;
$$;

revoke execute on function private.user_is_platform_admin(uuid), private.tenant_is_complimentary(uuid), public.tenant_access(uuid) from public, anon;
grant execute on function private.user_is_platform_admin(uuid), private.tenant_is_complimentary(uuid), public.tenant_access(uuid) to authenticated;
