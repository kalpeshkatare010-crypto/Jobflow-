-- Owner statistics: only accounts on the private owner list can read them,
-- nobody can add themselves, and the numbers add up.
\set ON_ERROR_STOP 1
\set QUIET 1

select test.create_user('operator@jobflow.test', 'Operator') as operator \gset
select test.create_user('customer@shop.test', 'Customer') as customer \gset

select test.as_user(:'customer');
select public.create_business('Customer Shop') as tenant \gset
select test.ok(public.am_platform_admin() = false, 'a customer is not the JobFlow owner');
select test.throws('select public.platform_stats()', '42501', 'a customer cannot read owner statistics');
select test.throws(format('insert into private.platform_admins (user_id) values (%L)', :'customer'), '42501',
  'nobody can add themselves to the owner list from the app');
reset role;

select test.as_anon();
select test.throws('select public.platform_stats()', '42501', 'signed-out visitors cannot read owner statistics');
reset role;

-- The project owner adds themselves in the Supabase SQL Editor (runs as postgres).
insert into private.platform_admins (user_id) values (:'operator');
update public.tenants set subscription_status = 'active', plan_code = 'standard' where id = :'tenant';

select test.as_user(:'operator');
select test.ok(public.am_platform_admin(), 'the owner is recognised');
select public.platform_stats() as stats \gset
select test.ok((:'stats'::jsonb ->> 'paying')::int >= 1, 'paying businesses are counted');
select test.ok((:'stats'::jsonb ->> 'monthlyRevenuePaise')::int >= 59900, 'monthly revenue adds up plan prices');
select test.ok(exists (select 1 from jsonb_array_elements(:'stats'::jsonb -> 'recentBusinesses') b
  where b ->> 'name' = 'Customer Shop' and (b ->> 'members')::int = 1), 'recent businesses list names and member counts');
select test.ok(jsonb_array_length(:'stats'::jsonb -> 'signUpsByWeek') = 8, 'sign-ups are given for 8 weeks');
select test.ok(not (:'stats'::text ~* 'job_number|title|customer_id|quantity'), 'no job contents are exposed');
reset role;

\echo 'All owner statistics tests passed.'
