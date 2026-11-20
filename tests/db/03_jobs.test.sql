-- Workflows, employees and job orders through sync_push: rules, numbering,
-- status moves, stage steps, permissions, plan limits and isolation.
\set ON_ERROR_STOP 1
\set QUIET 1

select test.create_user('owner@jobs.test', 'Jaya Owner') as owner \gset
select test.create_user('pm@jobs.test', 'Prakash PM') as pm \gset
select test.create_user('worker@jobs.test', 'Wasim Worker') as worker \gset
select test.create_user('rival@other.test', 'Rival') as rival \gset

select test.as_user(:'owner');
select public.create_business('Jobs Works') as tenant \gset
select public.create_invitation(:'tenant', 'pm@jobs.test', 'production_manager') as pm_token \gset
reset role;
select test.as_user(:'pm');
select public.accept_invitation(:'pm_token');
reset role;
select test.as_user(:'owner');
select public.create_invitation(:'tenant', 'worker@jobs.test', 'employee') as worker_token \gset
reset role;
select test.as_user(:'worker');
select public.accept_invitation(:'worker_token');
reset role;
select test.as_user(:'rival');
select public.create_business('Rival Works') as rival_tenant \gset
reset role;

-- One push helper per test step keeps the file readable.
create function test.push(p_tenant uuid, p_type text, p_entity uuid, p_payload jsonb, p_mutation uuid default gen_random_uuid())
returns jsonb language sql as $$
  select public.sync_push(p_tenant, jsonb_build_array(jsonb_build_object(
    'mutationId', p_mutation, 'type', p_type, 'entityId', p_entity, 'payload', p_payload))) -> 0;
$$;
grant execute on function test.push(uuid, text, uuid, jsonb, uuid) to authenticated;

\set cust '33333333-3333-4333-8333-333333333333'
\set wf '44444444-4444-4444-8444-444444444444'
\set s1 '44444444-0000-4000-8000-000000000001'
\set s2 '44444444-0000-4000-8000-000000000002'
\set s3 '44444444-0000-4000-8000-000000000003'
\set job '55555555-5555-4555-8555-555555555555'
\set js1 '55555555-0000-4000-8000-000000000001'
\set js2 '55555555-0000-4000-8000-000000000002'
\set js3 '55555555-0000-4000-8000-000000000003'
\set jobmut '66666666-6666-4666-8666-666666666666'

select test.as_user(:'pm');
select test.push(:'tenant', 'customer.create', :'cust', '{"changes":{"name":"Deccan Pumps"}}') ->> 'status' as s \gset
select test.ok(:'s' = 'applied', 'a production manager adds a customer');

-- ---------------------------------------------------------------------------
-- Workflows
-- ---------------------------------------------------------------------------
select test.push(:'tenant', 'workflow.save', :'wf', jsonb_build_object('name', 'Sheet metal', 'baseVersion', 0, 'stages', jsonb_build_array(
  jsonb_build_object('id', :'s1', 'name', 'Cutting', 'position', 0, 'counts_output', false),
  jsonb_build_object('id', :'s2', 'name', 'Bending', 'position', 1, 'counts_output', false),
  jsonb_build_object('id', :'s3', 'name', 'Packing', 'position', 2, 'counts_output', true)))) as wf_result \gset
select test.ok((:'wf_result'::jsonb ->> 'status') = 'applied', 'a workflow with the business''s own stages is saved');
select test.ok(jsonb_array_length(:'wf_result'::jsonb -> 'related' -> 'workflow_stages') = 3, 'its three stages are saved in order');

select test.ok((test.push(:'tenant', 'workflow.save', gen_random_uuid(), jsonb_build_object('name', 'Two outputs', 'baseVersion', 0, 'stages', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'name', 'A', 'position', 0, 'counts_output', true),
  jsonb_build_object('id', gen_random_uuid(), 'name', 'B', 'position', 1, 'counts_output', true)))) ->> 'reason') = 'invalid',
  'exactly one stage must count as finished output');

select test.ok((test.push(:'tenant', 'workflow.save', :'wf', jsonb_build_object('name', 'Renamed later', 'baseVersion', 0, 'stages', jsonb_build_array(
  jsonb_build_object('id', :'s1', 'name', 'Cutting', 'position', 0, 'counts_output', true)))) ->> 'reason') = 'workflow_changed',
  'saving a workflow someone else changed is a conflict, not an overwrite');

select test.ok((test.push(:'tenant', 'workflow.save', gen_random_uuid(), jsonb_build_object('name', 'Moulding', 'baseVersion', 0, 'stages', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'name', 'Moulding', 'position', 0, 'counts_output', true)))) ->> 'status') = 'applied',
  'a second workflow fits the Starter plan');
select test.ok((test.push(:'tenant', 'workflow.save', gen_random_uuid(), jsonb_build_object('name', 'Third', 'baseVersion', 0, 'stages', jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid(), 'name', 'X', 'position', 0, 'counts_output', true)))) ->> 'reason') = 'plan_limit',
  'the Starter plan stops at 2 workflows');

-- Employees through sync
select test.ok((test.push(:'tenant', 'employee.create', gen_random_uuid(), '{"changes":{"name":"Ravi Shinde","employee_code":"E01"}}') ->> 'status') = 'applied',
  'a production manager adds an employee to the roster');
reset role;

select test.as_user(:'worker');
select test.ok((test.push(:'tenant', 'workflow.save', gen_random_uuid(), jsonb_build_object('name', 'Nope', 'baseVersion', 0, 'stages', '[]'::jsonb)) ->> 'reason') = 'forbidden',
  'an employee cannot create workflows');
select test.ok((test.push(:'tenant', 'employee.create', gen_random_uuid(), '{"changes":{"name":"Ghost"}}') ->> 'reason') = 'forbidden',
  'an employee cannot add to the roster');
reset role;

-- ---------------------------------------------------------------------------
-- Job orders
-- ---------------------------------------------------------------------------
select test.as_user(:'pm');
select test.push(:'tenant', 'job.create', :'job', jsonb_build_object(
  'changes', jsonb_build_object('customer_id', :'cust', 'workflow_id', :'wf', 'title', 'Mounting brackets', 'quantity', 100,
    'unit', 'pcs', 'due_date', '2026-12-01', 'priority', 'high', 'status', 'draft'),
  'stages', jsonb_build_array(
    jsonb_build_object('id', :'js1', 'name', 'Cutting', 'position', 0, 'counts_output', false),
    jsonb_build_object('id', :'js2', 'name', 'Bending', 'position', 1, 'counts_output', false),
    jsonb_build_object('id', :'js3', 'name', 'Packing', 'position', 2, 'counts_output', true))), :'jobmut') as job_result \gset
select test.ok((:'job_result'::jsonb ->> 'status') = 'applied', 'a job order is created');
select test.ok((:'job_result'::jsonb -> 'row' ->> 'job_number') = 'JOB-0001', 'the server gives it the next job number');
select test.ok(jsonb_array_length(:'job_result'::jsonb -> 'related' -> 'job_stages') = 3, 'the job has its own copy of the stages');
select test.ok((:'job_result'::jsonb -> 'related' -> 'job_events' -> 0 ->> 'actor_name') = 'Prakash PM', 'history records who created it');

select test.ok((test.push(:'tenant', 'job.create', :'job', '{}'::jsonb, :'jobmut') -> 'row' ->> 'job_number') = 'JOB-0001',
  'retrying the same create returns the same job, no new number');
select test.ok((select count(*) = 1 from public.job_orders where id = :'job'), 'and no duplicate job');

select (test.push(:'tenant', 'job.create', gen_random_uuid(), jsonb_build_object(
  'changes', jsonb_build_object('customer_id', :'cust', 'title', 'Second job', 'quantity', 5, 'unit', 'set'),
  'stages', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', 'Make', 'position', 0, 'counts_output', true)))) -> 'row' ->> 'job_number') as second \gset
select test.ok(:'second' = 'JOB-0002', 'job numbers run in order');

select test.throws($q$insert into public.job_orders (id, tenant_id, job_number, customer_id, title, quantity, unit)
  values (gen_random_uuid(), (select id from public.tenants limit 1), 'X-1', gen_random_uuid(), 'x', 1, 'pcs')$q$,
  '42501', 'job orders cannot be written directly, only through the checked path');

-- Field merge treats 100 and 100.000 as the same quantity
select test.ok((test.push(:'tenant', 'job.update', :'job', '{"changes":{"quantity":120},"base":{"quantity":100}}') ->> 'status') = 'applied',
  'editing the quantity is not a false conflict');

-- Status moves
select test.ok((test.push(:'tenant', 'job.transition', :'job', '{"to":"approved"}') -> 'row' ->> 'status') = 'approved', 'a draft job is approved');
select test.ok((test.push(:'tenant', 'job.transition', :'job', '{"to":"completed"}') ->> 'reason') = 'invalid_transition',
  'an approved job cannot jump to completed');
select test.ok((test.push(:'tenant', 'job.transition', :'job', '{"to":"cancelled"}') ->> 'reason') = 'invalid',
  'cancelling needs a reason');

-- Stage steps
select test.push(:'tenant', 'job.stage', :'job', jsonb_build_object('stageId', :'js1', 'action', 'start')) as st \gset
select test.ok((:'st'::jsonb -> 'row' ->> 'status') = 'in_production', 'starting the first stage puts the job into production');
select test.ok((select status = 'in_progress' and started_at is not null from public.job_stages where id = :'js1'), 'the stage shows in progress');
select test.ok((test.push(:'tenant', 'job.stage', :'job', jsonb_build_object('stageId', :'js1', 'action', 'complete')) ->> 'status') = 'applied', 'the stage is completed');
select test.ok((test.push(:'tenant', 'job.stage', :'job', jsonb_build_object('stageId', :'js1', 'action', 'start')) ->> 'reason') = 'stage_changed',
  'starting a finished stage again is reported, not applied');
select test.ok((test.push(:'tenant', 'job.stage', :'job', jsonb_build_object('stageId', :'js1', 'action', 'complete')) ->> 'status') = 'applied',
  'repeating the same step from a second phone is harmless');

-- Hold and resume returns the job to where it was
select test.push(:'tenant', 'job.transition', :'job', '{"to":"on_hold","reason":"Waiting for sheet"}');
select test.ok((test.push(:'tenant', 'job.transition', :'job', '{"to":"approved"}') -> 'row' ->> 'status') = 'in_production',
  'resuming a held job returns it to production, where it was');
select test.ok((select count(*) >= 5 from public.job_events where job_id = :'job'), 'every step is in the job history');
reset role;

-- Permissions for employees
select test.as_user(:'worker');
select test.ok((test.push(:'tenant', 'job.transition', :'job', '{"to":"on_hold","reason":"x y z"}') ->> 'reason') = 'forbidden',
  'an employee cannot change job status by default');
select test.ok((test.push(:'tenant', 'job.create', gen_random_uuid(), '{}'::jsonb) ->> 'reason') = 'forbidden',
  'an employee cannot create jobs');
select test.ok((select count(*) = 2 from public.job_orders), 'an employee can see the business''s jobs');
reset role;

-- Isolation
select test.as_user(:'rival');
select test.ok((select count(*) = 0 from public.job_orders where tenant_id = :'tenant'), 'another business cannot see these jobs');
select test.ok((test.push(:'rival_tenant', 'job.create', gen_random_uuid(), jsonb_build_object(
  'changes', jsonb_build_object('customer_id', :'cust', 'title', 'Steal', 'quantity', 1, 'unit', 'pcs'),
  'stages', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', 'X', 'position', 0, 'counts_output', true)))) ->> 'reason') = 'invalid',
  'a job cannot use another business''s customer');
select test.ok((test.push(:'rival_tenant', 'job.transition', :'job', '{"to":"cancelled","reason":"sabotage"}') ->> 'reason') = 'not_found',
  'another business cannot touch these jobs even by id');
select test.ok((test.push(:'rival_tenant', 'job.create', :'job', jsonb_build_object(
  'changes', jsonb_build_object('customer_id', gen_random_uuid(), 'title', 'Same id', 'quantity', 1, 'unit', 'pcs'),
  'stages', '[]'::jsonb)) ->> 'reason') in ('duplicate', 'invalid'),
  'reusing another business''s job id is refused without revealing it');
reset role;

-- Pull carries the new tables
select test.as_user(:'pm');
select public.sync_pull(:'tenant') as pulled \gset
select test.ok(jsonb_array_length(:'pulled'::jsonb -> 'rows' -> 'job_orders') = 2
  and jsonb_array_length(:'pulled'::jsonb -> 'rows' -> 'job_stages') = 4
  and jsonb_array_length(:'pulled'::jsonb -> 'rows' -> 'workflows') = 2
  and jsonb_array_length(:'pulled'::jsonb -> 'rows' -> 'employees') = 1,
  'a device downloads jobs, stages, workflows and employees');
reset role;

-- Plan limit on open jobs and read-only mode
update public.plans set limits = jsonb_set(limits, '{open_jobs}', '2') where code = 'starter';
select test.as_user(:'pm');
select test.ok((test.push(:'tenant', 'job.create', gen_random_uuid(), jsonb_build_object(
  'changes', jsonb_build_object('customer_id', :'cust', 'title', 'Third', 'quantity', 1, 'unit', 'pcs'),
  'stages', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'name', 'X', 'position', 0, 'counts_output', true)))) ->> 'reason') = 'plan_limit',
  'the plan''s open-job limit is enforced on the server');
reset role;
update public.plans set limits = jsonb_set(limits, '{open_jobs}', '100') where code = 'starter';

update public.tenants set trial_ends_at = now() - interval '30 days' where id = :'tenant';
select test.as_user(:'pm');
select test.ok((test.push(:'tenant', 'job.transition', :'job', '{"to":"on_hold","reason":"late"}') ->> 'reason') = 'read_only',
  'an expired business cannot change jobs');
reset role;

\echo 'All job tests passed.'
