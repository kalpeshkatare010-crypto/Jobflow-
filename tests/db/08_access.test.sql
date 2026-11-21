-- One plan at Rs 999, trial-then-subscribe, and the admin's free, always-on access.
\set ON_ERROR_STOP 1
\set QUIET 1

select test.ok((select count(*) = 1 and min(price_inr_paise) = 99900 from public.plans where code <> 'test_limited'),
  'there is exactly one plan, at Rs 999 a month');

select test.create_user('customer@acc.test', 'Customer') as customer \gset
select test.create_user('kalpeshkatare@hotmail.com', 'Kalpesh') as admin_user \gset
select test.create_user('unconfirmed@acc.test', 'Unconfirmed') as unconfirmed \gset

select test.as_user(:'customer');
select public.create_business('Customer Works') as shop \gset
select test.ok((public.tenant_access(:'shop') ->> 'canUse')::boolean, 'a new business can use JobFlow during its trial');
select test.ok(not (public.tenant_access(:'shop') ->> 'isAdmin')::boolean, 'a customer is not the admin');
select test.ok((public.tenant_access(:'shop') ->> 'pricePaise')::int = 99900, 'the app is told the plan price');
reset role;

update public.tenants set trial_ends_at = now() - interval '1 minute' where id = :'shop';
select test.as_user(:'customer');
select test.ok(not (public.tenant_access(:'shop') ->> 'canUse')::boolean, 'the day the trial ends, the business must subscribe');
select test.ok((select count(*) = 1 from public.tenants where id = :'shop'), 'its data is kept, nothing is deleted');
reset role;

update public.tenants set subscription_status = 'active', current_period_end = now() + interval '30 days' where id = :'shop';
select test.as_user(:'customer');
select test.ok((public.tenant_access(:'shop') ->> 'canUse')::boolean, 'subscribing brings everything back');
reset role;
update public.tenants set current_period_end = now() - interval '2 days' where id = :'shop';
select test.as_user(:'customer');
select test.ok((public.tenant_access(:'shop') ->> 'canUse')::boolean, 'a late payment has 3 days of grace');
reset role;
update public.tenants set current_period_end = now() - interval '4 days' where id = :'shop';
select test.as_user(:'customer');
select test.ok(not (public.tenant_access(:'shop') ->> 'canUse')::boolean, 'after the grace days the business must renew');
reset role;

-- The admin, by confirmed email: always on, even with an ended trial
select test.as_user(:'admin_user');
select public.create_business('RK Digitals') as own \gset
reset role;
update public.tenants set trial_ends_at = now() - interval '90 days' where id = :'own';
select test.as_user(:'admin_user');
select test.ok((public.tenant_access(:'own') ->> 'isAdmin')::boolean, 'the admin email is recognised once confirmed');
select test.ok((public.tenant_access(:'own') ->> 'canUse')::boolean and (public.tenant_access(:'own') ->> 'complimentary')::boolean,
  'the admin''s own business never needs a subscription');
select test.ok(public.am_platform_admin(), 'the admin sees owner statistics');
reset role;

-- An admin email that is not confirmed is not trusted
update auth.users set email = 'kalpeshkatare010@gmail.com', email_confirmed_at = null where id = :'unconfirmed';
select test.as_user(:'unconfirmed');
select test.ok(not public.am_platform_admin(), 'an unconfirmed admin email gives no admin rights');
reset role;

select test.as_user(:'customer');
select test.throws(format('select public.tenant_access(%L)', :'own'), '42501', 'nobody can look up another business''s access');
select test.throws('select * from private.platform_admin_emails', '42501', 'the admin email list is private');
reset role;

\echo 'All access tests passed.'
