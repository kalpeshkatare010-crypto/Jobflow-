-- Inventory through sync_push: materials, the movement ledger, atomic
-- balances, negative-stock honesty, permissions and isolation.
\set ON_ERROR_STOP 1
\set QUIET 1

select test.create_user('owner@stock.test', 'Sita Owner') as owner \gset
select test.create_user('worker@stock.test', 'Ganesh Worker') as worker \gset
select test.create_user('outsider@stock.test', 'Outsider') as outsider \gset

select test.as_user(:'owner');
select public.create_business('Stock Works') as tenant \gset
select public.create_invitation(:'tenant', 'worker@stock.test', 'employee') as worker_token \gset
reset role;
select test.as_user(:'worker');
select public.accept_invitation(:'worker_token');
reset role;
select test.as_user(:'outsider');
select public.create_business('Elsewhere Stock') as other_tenant \gset
reset role;

\set mat '81111111-1111-4111-8111-111111111111'
\set m1 '82222222-0000-4000-8000-000000000001'
\set m2 '82222222-0000-4000-8000-000000000002'
\set m3 '82222222-0000-4000-8000-000000000003'
\set m4 '82222222-0000-4000-8000-000000000004'

select test.as_user(:'owner');
select test.push(:'tenant', 'material.create', :'mat',
  '{"changes":{"name":"Art paper 300gsm","code":"AP300","unit":"sheets","min_stock":500}}') as r \gset
select test.ok((:'r'::jsonb ->> 'status') = 'applied', 'the owner adds a material');
select test.ok((:'r'::jsonb -> 'row' ->> 'on_hand')::numeric = 0, 'a new material starts at zero stock');
select test.ok((test.push(:'tenant', 'material.create', gen_random_uuid(), '{"changes":{"name":"Other","code":"ap300"}}') ->> 'status') <> 'applied',
  'material codes are unique within the business, ignoring case');
select test.ok((test.push(:'tenant', 'material.update', :'mat',
  '{"changes":{"on_hand":99999,"name":"Art paper 300 gsm"},"base":{"on_hand":0,"name":"Art paper 300gsm"}}') -> 'row' ->> 'on_hand')::numeric = 0,
  'editing a material cannot change its stock');
select test.ok((test.push(:'tenant', 'material.update', :'mat',
  '{"changes":{"min_stock":400},"base":{"min_stock":500.000}}') -> 'row' ->> 'min_stock')::numeric = 400,
  '500 and 500.000 are the same value, so the edit applies without a false conflict');

select test.push(:'tenant', 'stock.move', :'m1', jsonb_build_object('materialId', :'mat', 'kind', 'receive', 'qty', 1000, 'date', current_date, 'reason', 'Supplier bill 42')) as r \gset
select test.ok((:'r'::jsonb -> 'related' -> 'materials' -> 0 ->> 'on_hand')::numeric = 1000, 'receiving 1,000 sheets raises stock to 1,000');
select test.ok((:'r'::jsonb -> 'row' ->> 'balance_after')::numeric = 1000, 'the movement records the balance after it');
select test.ok((test.push(:'tenant', 'stock.move', :'m1', jsonb_build_object('materialId', :'mat', 'kind', 'receive', 'qty', 1000, 'date', current_date)) -> 'related' -> 'materials' -> 0 ->> 'on_hand')::numeric = 1000,
  'sending the same movement again does not add stock twice');
select test.ok((test.push(:'tenant', 'stock.move', gen_random_uuid(), jsonb_build_object('materialId', :'mat', 'kind', 'adjust', 'qty', -5, 'date', current_date)) ->> 'reason') = 'invalid',
  'an adjustment needs a reason');
select test.ok((test.push(:'tenant', 'stock.move', gen_random_uuid(), jsonb_build_object('materialId', :'mat', 'kind', 'receive', 'qty', -5, 'date', current_date)) ->> 'reason') = 'invalid',
  'receiving a negative amount is refused');
reset role;

-- Employees issue material; two phones issuing more than is there both count
select test.as_user(:'worker');
select test.ok((test.push(:'tenant', 'stock.move', :'m2', jsonb_build_object('materialId', :'mat', 'kind', 'issue', 'qty', 700, 'date', current_date)) -> 'related' -> 'materials' -> 0 ->> 'on_hand')::numeric = 300,
  'an employee issues 700 sheets');
select test.ok((test.push(:'tenant', 'stock.move', :'m3', jsonb_build_object('materialId', :'mat', 'kind', 'issue', 'qty', 450, 'date', current_date)) -> 'related' -> 'materials' -> 0 ->> 'on_hand')::numeric = -150,
  'issuing more than is on hand is recorded honestly as negative stock, not blocked or hidden');
select test.ok((test.push(:'tenant', 'stock.move', gen_random_uuid(), jsonb_build_object('materialId', :'mat', 'kind', 'receive', 'qty', 10, 'date', current_date)) ->> 'reason') = 'forbidden',
  'an employee cannot receive stock');
select test.ok((test.push(:'tenant', 'material.update', :'mat', '{"changes":{"min_stock":1}}') ->> 'reason') = 'forbidden',
  'an employee cannot edit materials');
select test.throws(format('update public.materials set on_hand = 5 where id = %L', :'mat'), '42501', 'stock cannot be changed directly');
select test.throws(format('delete from public.stock_movements where id = %L', :'m1'), '42501', 'movements cannot be deleted');
reset role;

select test.as_user(:'owner');
select test.ok((test.push(:'tenant', 'stock.move', :'m4', jsonb_build_object('materialId', :'mat', 'kind', 'adjust', 'qty', 160, 'date', current_date, 'reason', 'Monthly count')) -> 'related' -> 'materials' -> 0 ->> 'on_hand')::numeric = 10,
  'a counted adjustment brings stock back with a reason');
select test.ok((select sum(qty) = 10 from public.stock_movements where material_id = :'mat'),
  'the balance always equals the sum of its movements');
reset role;

select test.as_user(:'outsider');
select test.ok((select count(*) = 0 from public.materials where tenant_id = :'tenant'), 'another business cannot see these materials');
reset role;

select test.as_user(:'worker');
select test.ok(jsonb_array_length(public.sync_pull(:'tenant') -> 'rows' -> 'stock_movements') = 4
  and jsonb_array_length(public.sync_pull(:'tenant') -> 'rows' -> 'materials') = 1,
  'devices download materials and movements');
reset role;

\echo 'All inventory tests passed.'
