-- Whole-database security checks, so a future table or function cannot
-- quietly skip the rules.
\set ON_ERROR_STOP 1
\set QUIET 1

select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'every table in the public schema has Row Level Security switched on');

select test.ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'),
  'signed-out visitors have no rights on any table');

select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    -- Functions that belong to an extension (dblink is used by the tests only) are not ours.
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  'every privileged (security definer) function pins its search path');

select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname in ('sync_push', 'sync_pull', 'create_business', 'create_invitation', 'accept_invitation')),
  'signed-out visitors cannot call the app''s functions');

select test.ok(not exists (
  select 1 from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'materials' and column_name = 'on_hand'
    and privilege_type in ('INSERT', 'UPDATE') and grantee in ('authenticated', 'anon', 'public')),
  'nobody can write a stock balance directly');

select test.ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'DELETE'),
  'nothing can be hard-deleted from the app; records are archived instead');

\echo 'All security checks passed.'
