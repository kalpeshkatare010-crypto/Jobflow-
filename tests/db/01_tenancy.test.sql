-- Tenant isolation, roles, invitations, plan limits and read-only mode.
-- Run with scripts/test-db.sh. Any failed assertion stops the run.
\set ON_ERROR_STOP 1
\set QUIET 1

-- ---------------------------------------------------------------------------
-- Setup: two separate businesses
-- ---------------------------------------------------------------------------
select test.create_user('asha@alpha.test', 'Asha') as user_a \gset
select test.create_user('bala@beta.test', 'Bala') as user_b \gset
select test.create_user('chetan@alpha.test', 'Chetan') as user_c \gset
select test.create_user('dev@alpha.test', 'Dev') as user_d \gset
select test.create_user('esha@alpha.test', 'Esha') as user_e \gset
select test.create_user('intruder@evil.test', 'Mallory') as user_m \gset

select test.ok((select full_name from public.profiles where user_id = :'user_a') = 'Asha',
  'sign-up creates a profile from the name given');

select test.as_user(:'user_a');
select public.create_business('Alpha Fabricators', 'Asha K') as tenant_a \gset
reset role;
select test.as_user(:'user_b');
select public.create_business('Beta Plastics') as tenant_b \gset
reset role;

select test.ok((select count(*) = 1 from public.memberships where tenant_id = :'tenant_a' and role = 'owner'),
  'creating a business makes the creator its only owner');
select test.ok((select job_prefix = 'JOB' from public.tenant_settings where tenant_id = :'tenant_a'),
  'creating a business creates its settings');
select test.ok((select subscription_status = 'trialing' and plan_code = 'standard' and trial_ends_at > now() + interval '13 days'
  from public.tenants where id = :'tenant_a'), 'a new business starts a 14-day trial of the JobFlow plan');
-- These tests check limit enforcement with a small test-only plan (the real plan has no limits).
insert into public.plans (code, name, price_inr_paise, limits, sort_order)
values ('test_limited', 'Limited (tests)', 0, '{"logins": 3, "employees": 15, "workflows": 2, "open_jobs": 100}', 9)
on conflict (code) do nothing;
update public.tenants set plan_code = 'test_limited' where id in (:'tenant_a', :'tenant_b');

-- ---------------------------------------------------------------------------
-- Isolation: each owner sees only their own business
-- ---------------------------------------------------------------------------
select test.as_user(:'user_a');
select test.ok((select count(*) = 1 from public.tenants), 'owner A sees exactly one business');
select test.ok((select id = :'tenant_a' from public.tenants), 'owner A sees business A');
select test.ok((select count(*) = 0 from public.tenants where id = :'tenant_b'), 'owner A cannot see business B');
select test.ok((select count(*) = 0 from public.tenant_settings where tenant_id = :'tenant_b'), 'owner A cannot see B settings');
select test.ok((select count(*) = 0 from public.memberships where tenant_id = :'tenant_b'), 'owner A cannot see B members');
select test.ok((select count(*) = 0 from public.profiles where user_id = :'user_b'), 'owner A cannot see B owner profile');

insert into public.employees (id, tenant_id, name, employee_code)
values ('00000000-0000-4000-8000-0000000000a1', :'tenant_a', 'Ravi S', 'E01');
select test.ok((select count(*) = 1 from public.employees where tenant_id = :'tenant_a'), 'owner A can add an employee');

select test.throws(
  format($q$insert into public.employees (id, tenant_id, name) values (gen_random_uuid(), %L, 'Spy')$q$, :'tenant_b'),
  '42501', 'owner A cannot add an employee to business B');

select test.throws(
  format($q$update public.tenants set plan_code = 'standard' where id = %L$q$, :'tenant_a'),
  '42501', 'owner cannot change the plan directly');
select test.throws(
  format($q$update public.tenants set subscription_status = 'active' where id = %L$q$, :'tenant_a'),
  '42501', 'owner cannot mark the subscription active directly');
select test.throws(
  format($q$update public.tenant_settings set next_job_number = 1 where tenant_id = %L$q$, :'tenant_a'),
  '42501', 'job numbering counter cannot be edited directly');
select test.throws(
  format($q$insert into public.memberships (tenant_id, user_id, role) values (%L, %L, 'owner')$q$, :'tenant_b', :'user_a'),
  '42501', 'nobody can add themselves to a business directly');
select test.throws(
  format($q$delete from public.employees where tenant_id = %L$q$, :'tenant_a'),
  '42501', 'rows cannot be hard-deleted from the app');
reset role;

-- B's update of A's tenant silently matches no rows under RLS
select test.as_user(:'user_b');
update public.tenants set name = 'Hacked' where id = :'tenant_a';
reset role;
select test.ok((select name = 'Alpha Fabricators' from public.tenants where id = :'tenant_a'),
  'owner B cannot rename business A');

select test.as_user(:'user_b');
update public.employees set name = 'Hacked' where tenant_id = :'tenant_a';
reset role;
select test.ok((select name = 'Ravi S' from public.employees where id = '00000000-0000-4000-8000-0000000000a1'),
  'owner B cannot edit business A employees');

-- Signed-out visitors get nothing
select test.as_anon();
select test.throws('select * from public.tenants', '42501', 'signed-out visitors cannot read businesses');
select test.throws($q$select public.create_business('Ghost')$q$, '42501', 'signed-out visitors cannot create a business');
reset role;

-- ---------------------------------------------------------------------------
-- Row stamping for sync
-- ---------------------------------------------------------------------------
select test.as_user(:'user_a');
update public.employees set name = 'Ravi Shinde' where id = '00000000-0000-4000-8000-0000000000a1';
reset role;
select test.ok((select version = 2 and updated_by = :'user_a'::uuid and txid is not null
  from public.employees where id = '00000000-0000-4000-8000-0000000000a1'),
  'updates bump version and record who and which transaction');

-- ---------------------------------------------------------------------------
-- Invitations and roles
-- ---------------------------------------------------------------------------
select test.as_user(:'user_a');
select public.create_invitation(:'tenant_a', 'Chetan@Alpha.test ', 'employee') as token_c \gset
select test.ok((select count(*) = 1 from public.invitations where tenant_id = :'tenant_a' and email = 'chetan@alpha.test'),
  'invitation is stored with a normalised email');
select test.ok((select count(*) = 0 from public.invitations where token_hash = :'token_c'),
  'the raw invitation token is never stored');
select test.throws(format($q$select public.create_invitation(%L, 'x@alpha.test', 'owner')$q$, :'tenant_a'),
  'invalid_role', 'nobody can be invited as a second owner');
reset role;

select test.as_user(:'user_m');
select test.throws(format($q$select public.accept_invitation(%L)$q$, :'token_c'),
  'invite_wrong_email', 'an invitation cannot be used by a different email');
select test.throws($q$select public.accept_invitation('not-a-real-token')$q$,
  'invite_invalid', 'a made-up token is rejected');
select test.throws(format($q$select public.create_invitation(%L, 'friend@evil.test', 'admin')$q$, :'tenant_a'),
  'forbidden', 'outsiders cannot invite people into a business');
reset role;

select test.as_user(:'user_c');
select test.ok(public.accept_invitation(:'token_c') = :'tenant_a'::uuid, 'the invited person can accept');
select test.ok((select count(*) = 1 from public.tenants), 'the new employee sees the business');
select test.throws(format($q$select public.accept_invitation(%L)$q$, :'token_c'),
  'invite_used', 'an invitation works only once');
select test.throws(
  format($q$insert into public.employees (id, tenant_id, name) values (gen_random_uuid(), %L, 'New')$q$, :'tenant_a'),
  '42501', 'an employee cannot manage the roster by default');
select test.throws(format($q$select public.create_invitation(%L, 'z@alpha.test', 'employee')$q$, :'tenant_a'),
  'forbidden', 'an employee cannot invite people');
update public.tenants set name = 'Renamed by employee' where id = :'tenant_a';
reset role;
select test.ok((select name = 'Alpha Fabricators' from public.tenants where id = :'tenant_a'),
  'an employee cannot change business settings');

-- Plan limit on logins: the limited test plan allows 3 (owner + Chetan + 1 more)
select test.as_user(:'user_a');
select public.create_invitation(:'tenant_a', 'dev@alpha.test', 'production_manager') as token_d \gset
select test.throws(format($q$select public.create_invitation(%L, 'esha@alpha.test', 'employee')$q$, :'tenant_a'),
  'plan_limit:logins', 'a plan with a login limit stops at it, counting open invitations');
reset role;

select test.as_user(:'user_d');
select public.accept_invitation(:'token_d');
insert into public.employees (id, tenant_id, name) values ('00000000-0000-4000-8000-0000000000a2', :'tenant_a', 'Meena P');
select test.ok(true, 'a production manager can add employees');
select (select id from public.memberships where tenant_id = :'tenant_a' and user_id = :'user_c') as membership_c \gset
select test.throws(format($q$select public.revoke_member(%L)$q$, :'membership_c'),
  'not_found', 'a production manager cannot remove members');
reset role;

-- Owner protections and revocation
select test.as_user(:'user_a');
select (select id from public.memberships where tenant_id = :'tenant_a' and user_id = :'user_a') as membership_a \gset
select test.throws(format($q$select public.revoke_member(%L)$q$, :'membership_a'),
  'self_change', 'the owner cannot remove themselves');
select test.throws(format($q$select public.change_member_role(%L, 'owner')$q$, :'membership_c'),
  'invalid_role', 'ownership cannot be handed over by changing a role');
select public.set_member_permissions(:'membership_c', '{"employees.manage": true}');
select test.throws(format($q$select public.set_member_permissions(%L, '{"billing.manage": true}')$q$, :'membership_c'),
  'invalid_permissions', 'billing permission cannot be given to an employee');
reset role;

select test.as_user(:'user_c');
insert into public.employees (id, tenant_id, name) values (gen_random_uuid(), :'tenant_a', 'Added by Chetan');
select test.ok(true, 'an employee can manage the roster once the owner switches that permission on');
reset role;

select test.as_user(:'user_a');
select public.revoke_member(:'membership_c');
reset role;
select test.as_user(:'user_c');
select test.ok((select count(*) = 0 from public.tenants), 'a removed member immediately loses access');
select test.ok((select count(*) = 0 from public.employees), 'a removed member cannot read employees');
reset role;

-- ---------------------------------------------------------------------------
-- Subscription enforcement: the trial ends, and work stops until a subscription
-- ---------------------------------------------------------------------------
update public.tenants set trial_ends_at = now() - interval '1 hour' where id = :'tenant_a';
select test.as_user(:'user_a');
select test.ok((select count(*) = 1 from public.tenants), 'an expired business can still read its data');
select test.throws(
  format($q$insert into public.employees (id, tenant_id, name) values (gen_random_uuid(), %L, 'Late')$q$, :'tenant_a'),
  '42501', 'an expired business cannot add records');
select test.throws(format($q$select public.create_invitation(%L, 'esha@alpha.test', 'employee')$q$, :'tenant_a'),
  'read_only', 'an expired business cannot invite people');
reset role;
update public.tenants set trial_ends_at = now() + interval '1 day' where id = :'tenant_a';
select test.as_user(:'user_a');
insert into public.employees (id, tenant_id, name) values (gen_random_uuid(), :'tenant_a', 'Still on trial');
select test.ok(true, 'writes work while the trial runs');
reset role;

-- ---------------------------------------------------------------------------
-- Plan limit on employees: the limited test plan allows 15 active
-- ---------------------------------------------------------------------------
select test.as_user(:'user_b');
insert into public.employees (id, tenant_id, name)
select gen_random_uuid(), :'tenant_b', 'Worker ' || n from generate_series(1, 15) as n;
select test.throws(
  format($q$insert into public.employees (id, tenant_id, name) values (gen_random_uuid(), %L, 'Worker 16')$q$, :'tenant_b'),
  'plan_limit:employees', 'a plan with an employee limit stops at it');
reset role;
update public.tenants set plan_code = 'standard' where id = :'tenant_b';
select test.as_user(:'user_b');
insert into public.employees (id, tenant_id, name) values (gen_random_uuid(), :'tenant_b', 'Worker 16');
select test.ok(true, 'Professional plan has no employee limit');
reset role;

\echo 'All tenancy tests passed.'
