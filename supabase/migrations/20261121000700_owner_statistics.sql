-- JobFlow migration 0007: owner statistics for the JobFlow operator (RK Digitals)
--
-- A private list of operator accounts. It lives in the private schema, which
-- the API does not expose, and the app has no rights on it: the only way to add
-- someone is the Supabase dashboard's SQL Editor, behind the project owner's
-- Supabase login (docs/OWNER.md). Every statistics call checks the list on the
-- server. Statistics are counts and business names only, never job contents.

create table private.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
revoke all on private.platform_admins from public, anon, authenticated;

create function private.is_platform_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (select 1 from private.platform_admins a where a.user_id = auth.uid());
$$;

-- Lets the app decide whether to show the menu item. Answers only about the caller.
create function public.am_platform_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_platform_admin();
$$;

create function public.platform_stats() returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'Only the JobFlow owner can see these statistics.' using errcode = '42501', hint = 'forbidden';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'signUps', (select count(*) from auth.users),
    'signUpsLast7Days', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'activeLast7Days', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'activeLast30Days', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'businesses', (select count(*) from public.tenants where deleted_at is null and not is_demo),
    'onTrial', (select count(*) from public.tenants where deleted_at is null and not is_demo
                  and subscription_status = 'trialing' and trial_ends_at > now()),
    'trialsEndingIn7Days', (select count(*) from public.tenants where deleted_at is null and not is_demo
                  and subscription_status = 'trialing' and trial_ends_at between now() and now() + interval '7 days'),
    'paying', (select count(*) from public.tenants where deleted_at is null and subscription_status = 'active'),
    'payingByPlan', (select coalesce(jsonb_object_agg(plan_code, n), '{}'::jsonb)
                     from (select plan_code, count(*) n from public.tenants
                           where deleted_at is null and subscription_status = 'active' group by plan_code) p),
    'monthlyRevenuePaise', (select coalesce(sum(pl.price_inr_paise), 0) from public.tenants t
                            join public.plans pl on pl.code = t.plan_code
                            where t.deleted_at is null and t.subscription_status = 'active'),
    'readOnly', (select count(*) from public.tenants t where t.deleted_at is null and not t.is_demo
                  and not private.tenant_can_write(t.id)),
    'jobs', (select count(*) from public.job_orders where deleted_at is null),
    'jobsLast7Days', (select count(*) from public.job_orders where created_at > now() - interval '7 days'),
    'productionEntriesLast7Days', (select count(*) from public.production_entries where created_at > now() - interval '7 days'),
    'signUpsByWeek', (
      select coalesce(jsonb_agg(jsonb_build_object('weekStart', w::date, 'count',
               (select count(*) from auth.users u where u.created_at >= w and u.created_at < w + interval '7 days')) order by w), '[]'::jsonb)
      from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w),
    'recentBusinesses', (
      select coalesce(jsonb_agg(b order by b ->> 'createdAt' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'name', t.name,
          'createdAt', t.created_at,
          'plan', t.plan_code,
          'status', t.subscription_status,
          'trialEndsAt', t.trial_ends_at,
          'canWrite', private.tenant_can_write(t.id),
          'members', (select count(*) from public.memberships m where m.tenant_id = t.id and m.deleted_at is null and m.status = 'active'),
          'jobs', (select count(*) from public.job_orders j where j.tenant_id = t.id and j.deleted_at is null),
          'lastActivityAt', greatest(
            (select max(j.updated_at) from public.job_orders j where j.tenant_id = t.id),
            (select max(e.created_at) from public.production_entries e where e.tenant_id = t.id),
            t.created_at)
        ) as b
        from public.tenants t
        where t.deleted_at is null and not t.is_demo
        order by t.created_at desc
        limit 100
      ) recent)
  ) into v_out;
  return v_out;
end;
$$;

revoke execute on function private.is_platform_admin(), public.am_platform_admin(), public.platform_stats() from public, anon;
grant execute on function private.is_platform_admin(), public.am_platform_admin(), public.platform_stats() to authenticated;
