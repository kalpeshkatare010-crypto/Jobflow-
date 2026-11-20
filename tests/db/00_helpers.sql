-- Test helpers: switch identity, create users, assert results and errors.
create schema test;
grant usage on schema test to anon, authenticated;

create function test.create_user(p_email text, p_name text default '') returns uuid
language sql
as $$
  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), lower(p_email), jsonb_build_object('full_name', p_name))
  returning id;
$$;

-- Act as a signed-in user (role "authenticated" with their JWT subject).
create function test.as_user(p_user uuid) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, false);
  perform set_config('role', 'authenticated', false);
end;
$$;

create function test.as_anon() returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('role', 'anon', false);
end;
$$;

create function test.ok(p_condition boolean, p_message text) returns void
language plpgsql
as $$
begin
  if p_condition is distinct from true then
    raise exception 'FAILED: %', p_message;
  end if;
  raise notice 'ok - %', p_message;
end;
$$;

-- Runs p_sql and passes only if it fails with the expected SQLSTATE or hint.
create function test.throws(p_sql text, p_expected text, p_message text) returns void
language plpgsql
as $$
declare
  v_state text;
  v_hint text;
  v_text text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_hint = pg_exception_hint, v_text = message_text;
    if v_state = p_expected or v_hint = p_expected then
      raise notice 'ok - % (%: %)', p_message, v_state, v_text;
      return;
    end if;
    raise exception 'FAILED: % - expected %, got % / % / %', p_message, p_expected, v_state, v_hint, v_text;
  end;
  raise exception 'FAILED: % - expected an error (%), but it succeeded', p_message, p_expected;
end;
$$;

grant execute on all functions in schema test to anon, authenticated;
