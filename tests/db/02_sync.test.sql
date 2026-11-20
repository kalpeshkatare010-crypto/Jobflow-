-- Sync protocol: idempotent push, field-level merge, conflicts, isolation and
-- the commit-safe pull cursor (with a second connection holding a transaction open).
\set ON_ERROR_STOP 1
\set QUIET 1

create extension if not exists dblink;

select test.create_user('owner@sync.test', 'Sync Owner') as owner \gset
select test.create_user('worker@sync.test', 'Sync Worker') as worker \gset
select test.create_user('other@else.test', 'Other Owner') as other \gset

select test.as_user(:'owner');
select public.create_business('Sync Works') as tenant \gset
select public.create_invitation(:'tenant', 'worker@sync.test', 'employee') as worker_token \gset
reset role;
select test.as_user(:'worker');
select public.accept_invitation(:'worker_token');
reset role;
select test.as_user(:'other');
select public.create_business('Other Works') as other_tenant \gset
reset role;

\set cust '11111111-1111-4111-8111-111111111111'
\set m1 'aaaaaaaa-0000-4000-8000-000000000001'

-- ---------------------------------------------------------------------------
-- Idempotent create
-- ---------------------------------------------------------------------------
select test.as_user(:'owner');
select public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', :'m1', 'type', 'customer.create', 'entityId', :'cust',
  'payload', jsonb_build_object('changes', jsonb_build_object('name', 'Deccan Pumps', 'phone', '98200 00000', 'gstin', '27abcde1234f1z5'))
))) -> 0 as first_result \gset
select test.ok((:'first_result'::jsonb ->> 'status') = 'applied', 'creating a customer is applied');
select test.ok((:'first_result'::jsonb -> 'row' ->> 'version') = '1', 'the result carries the saved row and its version');
select test.ok((:'first_result'::jsonb -> 'row' ->> 'gstin') = '27ABCDE1234F1Z5', 'GSTIN is stored in capitals');

select public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', :'m1', 'type', 'customer.create', 'entityId', :'cust',
  'payload', jsonb_build_object('changes', jsonb_build_object('name', 'Deccan Pumps'))
))) -> 0 as retry_result \gset
select test.ok(:'retry_result'::jsonb = :'first_result'::jsonb, 'sending the same change again returns the same result');
select test.ok((select count(*) = 1 from public.customers where id = :'cust'), 'a retried create never makes a duplicate');
select test.ok((select count(*) = 1 from public.applied_mutations where mutation_id = :'m1'), 'the change is recorded once');

-- ---------------------------------------------------------------------------
-- Field-level merge
-- ---------------------------------------------------------------------------
-- Device A renames, device B changes the phone; both started from version 1.
select (public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', gen_random_uuid(), 'type', 'customer.update', 'entityId', :'cust',
  'payload', jsonb_build_object('changes', jsonb_build_object('name', 'Deccan Pumps Ltd'),
                                'base', jsonb_build_object('name', 'Deccan Pumps')))
)) -> 0 ->> 'status') as a_status \gset
select (public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', gen_random_uuid(), 'type', 'customer.update', 'entityId', :'cust',
  'payload', jsonb_build_object('changes', jsonb_build_object('phone', '98200 11111'),
                                'base', jsonb_build_object('phone', '98200 00000')))
)) -> 0 ->> 'status') as b_status \gset
select test.ok(:'a_status' = 'applied' and :'b_status' = 'applied', 'edits to different fields from two devices are both applied');
select test.ok((select name = 'Deccan Pumps Ltd' and phone = '98200 11111' and version = 3 from public.customers where id = :'cust'),
  'both edits are kept, nothing overwritten');

-- Device C edits the name starting from the old value: a real conflict.
select public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', gen_random_uuid(), 'type', 'customer.update', 'entityId', :'cust',
  'payload', jsonb_build_object('changes', jsonb_build_object('name', 'DP Industries', 'notes', 'Prefers WhatsApp'),
                                'base', jsonb_build_object('name', 'Deccan Pumps', 'notes', null)))
)) -> 0 as c_result \gset
select test.ok((:'c_result'::jsonb ->> 'status') = 'conflict', 'changing a field someone else already changed is a conflict');
select test.ok((:'c_result'::jsonb -> 'fields') = '["name"]'::jsonb, 'the conflict names the field');
select test.ok((select name = 'Deccan Pumps Ltd' and notes = 'Prefers WhatsApp' from public.customers where id = :'cust'),
  'the conflicting field is not overwritten; other fields in the change are applied');

-- Delete after someone else edited
select public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', gen_random_uuid(), 'type', 'customer.delete', 'entityId', :'cust',
  'payload', jsonb_build_object('baseVersion', 1)
))) -> 0 ->> 'reason' as del_reason \gset
select test.ok(:'del_reason' = 'edited_after_delete', 'deleting a record edited elsewhere asks a person first');
select test.ok((select deleted_at is null from public.customers where id = :'cust'), 'the record is kept until someone decides');

-- Invalid data is refused with a reason, and the batch continues
select public.sync_push(:'tenant', jsonb_build_array(
  jsonb_build_object('mutationId', gen_random_uuid(), 'type', 'customer.create', 'entityId', gen_random_uuid(),
    'payload', jsonb_build_object('changes', jsonb_build_object('name', ''))),
  jsonb_build_object('mutationId', gen_random_uuid(), 'type', 'customer.create', 'entityId', gen_random_uuid(),
    'payload', jsonb_build_object('changes', jsonb_build_object('name', 'Kaveri Agro Tools')))
)) as batch \gset
select test.ok((:'batch'::jsonb -> 0 ->> 'reason') = 'invalid', 'a customer without a name is refused as invalid');
select test.ok((:'batch'::jsonb -> 1 ->> 'status') = 'applied', 'the rest of the batch still goes through');
reset role;

-- ---------------------------------------------------------------------------
-- Permissions and isolation
-- ---------------------------------------------------------------------------
select test.as_user(:'worker');
select (public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', gen_random_uuid(), 'type', 'customer.create', 'entityId', gen_random_uuid(),
  'payload', jsonb_build_object('changes', jsonb_build_object('name', 'Not allowed')))
)) -> 0 ->> 'reason') as worker_reason \gset
select test.ok(:'worker_reason' = 'forbidden', 'an employee without customer permission is refused');
select (public.sync_push(:'tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', gen_random_uuid(), 'type', 'customer.update', 'entityId', :'cust',
  'payload', jsonb_build_object('changes', jsonb_build_object('phone', '000'), 'base', jsonb_build_object('phone', '98200 11111')))
)) -> 0 ->> 'reason') as worker_update_reason \gset
select test.ok(:'worker_update_reason' = 'forbidden', 'an employee cannot edit a customer either');
select test.ok((select jsonb_array_length(public.sync_pull(:'tenant') -> 'rows' -> 'customers') = 2),
  'an employee can still download customers');
reset role;

select test.as_user(:'other');
select test.throws(format($q$select public.sync_pull(%L)$q$, :'tenant'), 'forbidden', 'another business cannot download these customers');
select test.throws(format($q$select public.sync_push(%L, '[{"mutationId":"%s","type":"customer.create","entityId":"%s","payload":{"changes":{"name":"x"}}}]')$q$,
  :'tenant', gen_random_uuid(), gen_random_uuid()), 'forbidden', 'another business cannot upload into this one');
-- Pushing into their own business with an id that exists elsewhere does not leak or overwrite.
select (public.sync_push(:'other_tenant', jsonb_build_array(jsonb_build_object(
  'mutationId', gen_random_uuid(), 'type', 'customer.update', 'entityId', :'cust',
  'payload', jsonb_build_object('changes', jsonb_build_object('name', 'Stolen'), 'base', '{}'::jsonb))
)) -> 0 ->> 'reason') as cross_reason \gset
select test.ok(:'cross_reason' = 'not_found', 'a record of another business is invisible even by id');
reset role;
select test.ok((select name = 'Deccan Pumps Ltd' from public.customers where id = :'cust'), 'and it stays unchanged');

-- ---------------------------------------------------------------------------
-- Pull: incremental and commit-safe
-- ---------------------------------------------------------------------------
select test.as_user(:'owner');
select public.sync_pull(:'tenant') as pull1 \gset
select test.ok((select jsonb_array_length(:'pull1'::jsonb -> 'rows' -> 'customers') = 2), 'the first pull downloads all customers');
select test.ok((:'pull1'::jsonb ->> 'hasMore') = 'false', 'everything fits in one page');
select :'pull1'::jsonb -> 'cursor' as cursor1 \gset
select test.ok((select jsonb_array_length(public.sync_pull(:'tenant', :'cursor1') -> 'rows' -> 'customers') = 0),
  'pulling again with the new checkpoint downloads nothing unchanged');

-- Paging: one row per page still reaches the end
select public.sync_pull(:'tenant', '{}'::jsonb, 1) as page1 \gset
select test.ok((:'page1'::jsonb ->> 'hasMore') = 'true', 'a small page size reports more to come');
select public.sync_pull(:'tenant', :'page1'::jsonb -> 'cursor', 1) as page2 \gset
select public.sync_pull(:'tenant', :'page2'::jsonb -> 'cursor', 1) as page3 \gset
select test.ok((select jsonb_array_length(:'page2'::jsonb -> 'rows' -> 'customers') = 1
  and (:'page1'::jsonb -> 'rows' -> 'customers' -> 0 ->> 'id') <> (:'page2'::jsonb -> 'rows' -> 'customers' -> 0 ->> 'id')),
  'the next page continues where the last one stopped');
select test.ok((:'page3'::jsonb ->> 'hasMore') = 'false', 'paging finishes');
reset role;

-- A slow transaction on another connection writes a customer and has not committed yet.
select dblink_connect('slow', :'dblink_conn');
select dblink_exec('slow', 'begin');
select dblink_exec('slow', format(
  $q$insert into public.customers (id, tenant_id, name) values ('22222222-2222-4222-8222-222222222222', %L, 'Slow Transaction Co')$q$,
  :'tenant'));

-- Meanwhile a fast change commits and a device pulls.
update public.customers set notes = 'fast change' where id = :'cust';
select test.as_user(:'owner');
select public.sync_pull(:'tenant', :'cursor1') as pull2 \gset
select test.ok((select jsonb_array_length(:'pull2'::jsonb -> 'rows' -> 'customers') = 1), 'the device gets the fast change');
select :'pull2'::jsonb -> 'cursor' as cursor2 \gset
reset role;

-- Now the slow transaction commits, with an older transaction id than the fast one.
select dblink_exec('slow', 'commit');
select dblink_disconnect('slow');

select test.as_user(:'owner');
select public.sync_pull(:'tenant', :'cursor2') as pull3 \gset
select test.ok((select exists (select 1 from jsonb_array_elements(:'pull3'::jsonb -> 'rows' -> 'customers') r
                                where r ->> 'name' = 'Slow Transaction Co')),
  'a row committed late by a slow transaction is still downloaded (commit-safe cursor)');
reset role;

\echo 'All sync tests passed.'
