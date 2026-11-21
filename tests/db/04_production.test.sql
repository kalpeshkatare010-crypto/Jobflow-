-- Production entries through sync_push: recording, idempotency, validation,
-- voiding (never editing), job effects, permissions and isolation.
\set ON_ERROR_STOP 1
\set QUIET 1

select test.create_user('owner@prod.test', 'Priya Owner') as owner \gset
select test.create_user('worker@prod.test', 'Sunil Worker') as worker \gset
select test.create_user('outsider@prod.test', 'Outsider') as outsider \gset

select test.as_user(:'owner');
select public.create_business('Prod Works') as tenant \gset
select public.create_invitation(:'tenant', 'worker@prod.test', 'employee') as worker_token \gset
reset role;
select test.as_user(:'worker');
select public.accept_invitation(:'worker_token');
reset role;
select test.as_user(:'outsider');
select public.create_business('Elsewhere') as other_tenant \gset
reset role;

create or replace function test.push(p_tenant uuid, p_type text, p_entity uuid, p_payload jsonb, p_mutation uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.sync_push(p_tenant, jsonb_build_array(jsonb_build_object(
    'mutationId', p_mutation, 'type', p_type, 'entityId', p_entity, 'payload', p_payload))) -> 0;
$$;
grant execute on function test.push(uuid, text, uuid, jsonb, uuid) to authenticated;

\set cust '73333333-3333-4333-8333-333333333333'
\set emp '78888888-8888-4888-8888-888888888888'
\set job '75555555-5555-4555-8555-555555555555'
\set js1 '75555555-0000-4000-8000-000000000001'
\set js2 '75555555-0000-4000-8000-000000000002'
\set draft '76666666-6666-4666-8666-666666666666'
\set ds1 '76666666-0000-4000-8000-000000000001'
\set e1 '79999999-0000-4000-8000-000000000001'
\set e2 '79999999-0000-4000-8000-000000000002'
\set e3 '79999999-0000-4000-8000-000000000003'
\set m1 '7aaaaaaa-0000-4000-8000-000000000001'

select test.as_user(:'owner');
select test.push(:'tenant', 'customer.create', :'cust', '{"changes":{"name":"Godavari Foods"}}');
select test.push(:'tenant', 'employee.create', :'emp', '{"changes":{"name":"Sunil Pawar"}}');
select test.push(:'tenant', 'job.create', :'job', jsonb_build_object(
  'changes', jsonb_build_object('customer_id', :'cust', 'title', 'Cartons', 'quantity', 1000, 'unit', 'pcs', 'status', 'approved'),
  'stages', jsonb_build_array(
    jsonb_build_object('id', :'js1', 'name', 'Printing', 'position', 0, 'counts_output', false),
    jsonb_build_object('id', :'js2', 'name', 'Die cutting', 'position', 1, 'counts_output', true))));
select test.push(:'tenant', 'job.create', :'draft', jsonb_build_object(
  'changes', jsonb_build_object('customer_id', :'cust', 'title', 'Draft job', 'quantity', 10, 'unit', 'pcs'),
  'stages', jsonb_build_array(jsonb_build_object('id', :'ds1', 'name', 'Only', 'position', 0, 'counts_output', true))));
reset role;

-- ---------------------------------------------------------------------------
-- Recording
-- ---------------------------------------------------------------------------
select test.as_user(:'worker');
select test.push(:'tenant', 'production.record', :'e1', jsonb_build_object(
  'jobId', :'job', 'stageId', :'js1', 'employeeId', :'emp', 'date', current_date,
  'good', 480, 'rejected', 20, 'reason', 'Ink smudge'), :'m1') as r1 \gset
select test.ok((:'r1'::jsonb ->> 'status') = 'applied', 'a shop-floor employee records production');
select test.ok((:'r1'::jsonb -> 'row' ->> 'recorded_by_name') = 'Sunil Worker', 'the entry says who recorded it');
select test.ok((:'r1'::jsonb -> 'related' -> 'job_orders' -> 0 ->> 'status') = 'in_production',
  'recording on an approved job puts it into production');
select test.ok((select status = 'in_progress' from public.job_stages where id = :'js1'), 'and starts the stage');
select test.ok(jsonb_array_length(:'r1'::jsonb -> 'related' -> 'job_stages') = 2, 'the reply carries the job''s stages for the device');

select test.ok((test.push(:'tenant', 'production.record', :'e1', jsonb_build_object(
  'jobId', :'job', 'stageId', :'js1', 'date', current_date, 'good', 480), :'m1') ->> 'status') = 'applied',
  'sending the same queued entry again is accepted');
select test.ok((select count(*) = 1 from public.production_entries where id = :'e1'), 'and it is stored only once');

select test.ok((test.push(:'tenant', 'production.record', :'e2', jsonb_build_object(
  'jobId', :'job', 'stageId', :'js2', 'date', current_date, 'good', 300)) ->> 'status') = 'applied',
  'a second phone''s entry for another stage adds up, it never conflicts');

select test.ok((test.push(:'tenant', 'production.record', gen_random_uuid(), jsonb_build_object(
  'jobId', :'job', 'stageId', :'js2', 'date', current_date, 'good', 0, 'rejected', 0)) ->> 'reason') = 'invalid',
  'an entry with nothing produced is refused');
select test.ok((test.push(:'tenant', 'production.record', gen_random_uuid(), jsonb_build_object(
  'jobId', :'job', 'stageId', :'js2', 'date', current_date, 'good', 5, 'rejected', 3)) ->> 'message') = 'Give a reason for the rejected quantity.',
  'rejected quantity needs a reason');
select test.ok((test.push(:'tenant', 'production.record', gen_random_uuid(), jsonb_build_object(
  'jobId', :'job', 'stageId', :'js2', 'date', '2020-01-01', 'good', 5)) ->> 'reason') = 'invalid',
  'dates more than a year back are refused');
select test.ok((test.push(:'tenant', 'production.record', gen_random_uuid(), jsonb_build_object(
  'jobId', :'job', 'stageId', :'ds1', 'date', current_date, 'good', 5)) ->> 'reason') = 'not_found',
  'a stage from another job is refused');
select test.ok((test.push(:'tenant', 'production.record', gen_random_uuid(), jsonb_build_object(
  'jobId', :'draft', 'stageId', :'ds1', 'date', current_date, 'good', 5)) ->> 'reason') = 'job_not_active',
  'a draft job takes no production, and the device is told why');
select test.ok((test.push(:'tenant', 'production.record', gen_random_uuid(), jsonb_build_object(
  'jobId', :'job', 'stageId', :'js1', 'date', current_date, 'good', 'lots')) ->> 'reason') = 'invalid',
  'a quantity that is not a number is refused');

-- Employees cannot void, and nobody can edit or delete directly
select test.ok((test.push(:'tenant', 'production.void', :'e1', '{"reason":"typo"}') ->> 'reason') = 'forbidden',
  'an employee cannot void entries');
select test.throws(format('update public.production_entries set good_qty = 1 where id = %L', :'e1'), '42501',
  'entries cannot be edited directly');
select test.throws(format('delete from public.production_entries where id = %L', :'e1'), '42501',
  'entries cannot be deleted directly');
reset role;

-- ---------------------------------------------------------------------------
-- Voiding
-- ---------------------------------------------------------------------------
select test.as_user(:'owner');
select test.ok((test.push(:'tenant', 'production.void', :'e2', '{"reason":""}') ->> 'reason') = 'invalid',
  'voiding needs a reason');
select test.push(:'tenant', 'production.void', :'e2', '{"reason":"Counted twice"}') as v \gset
select test.ok((:'v'::jsonb -> 'row' ->> 'void_reason') = 'Counted twice', 'the owner voids a wrong entry with a reason');
select test.ok((select good_qty = 300 and voided_at is not null from public.production_entries where id = :'e2'),
  'the voided entry keeps its numbers for the record');
select test.ok((test.push(:'tenant', 'production.void', :'e2', '{"reason":"again"}') -> 'row' ->> 'void_reason') = 'Counted twice',
  'voiding twice changes nothing');

-- Late entries on a completed job are kept
select test.push(:'tenant', 'job.transition', :'job', '{"to":"completed"}');
select test.ok((test.push(:'tenant', 'production.record', :'e3', jsonb_build_object(
  'jobId', :'job', 'stageId', :'js2', 'date', current_date - 1, 'good', 50)) ->> 'status') = 'applied',
  'an entry recorded offline before completion is still kept');
reset role;

-- ---------------------------------------------------------------------------
-- Isolation and sync
-- ---------------------------------------------------------------------------
select test.as_user(:'outsider');
select test.ok((select count(*) = 0 from public.production_entries where tenant_id = :'tenant'),
  'another business cannot read these entries');
select test.throws(format($q$select test.push(%L, 'production.record', gen_random_uuid(), '{}'::jsonb)$q$, :'tenant'),
  '42501', 'another business cannot record into this one');
reset role;

select test.as_user(:'worker');
select test.ok(jsonb_array_length(public.sync_pull(:'tenant') -> 'rows' -> 'production_entries') = 3,
  'devices download production entries, voided ones included');
reset role;

update public.tenants set trial_ends_at = now() - interval '30 days' where id = :'tenant';
select test.as_user(:'worker');
select test.ok((test.push(:'tenant', 'production.record', gen_random_uuid(), jsonb_build_object(
  'jobId', :'job', 'stageId', :'js2', 'date', current_date, 'good', 1)) ->> 'reason') = 'read_only',
  'an expired business cannot record production');
reset role;

\echo 'All production tests passed.'
