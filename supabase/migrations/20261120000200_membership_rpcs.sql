-- =============================================================================
-- JobFlow migration 0002: business creation, invitations and member management
--
-- These are the only ways to create a business or change who belongs to it.
-- Each function is SECURITY DEFINER (it writes rows the caller cannot write
-- directly), so each one checks the caller's identity and permission itself
-- before doing anything. search_path is empty and every name is qualified.
-- =============================================================================

-- Raised errors use SQLSTATE P0001 with a hint code the app maps to a message.

create function public.create_business(p_name text, p_owner_name text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_owned integer;
begin
  if v_user is null then
    raise exception 'Sign in to create a business.' using errcode = '42501', hint = 'auth_required';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 then
    raise exception 'Enter a business name of at least 2 characters.' using errcode = 'P0001', hint = 'invalid_name';
  end if;

  -- Limit businesses one login can own, to stop abuse of free trials.
  select count(*) into v_owned from public.memberships m
  where m.user_id = v_user and m.role = 'owner' and m.status = 'active' and m.deleted_at is null;
  if v_owned >= 3 then
    raise exception 'You already own 3 businesses.' using errcode = 'P0001', hint = 'too_many_businesses';
  end if;

  insert into public.tenants (name, created_by) values (btrim(p_name), v_user) returning id into v_tenant;
  insert into public.tenant_settings (tenant_id) values (v_tenant);
  insert into public.memberships (tenant_id, user_id, role, status, created_by)
  values (v_tenant, v_user, 'owner', 'active', v_user);

  if p_owner_name is not null and char_length(btrim(p_owner_name)) > 0 then
    update public.profiles set full_name = left(btrim(p_owner_name), 120), updated_at = now()
    where user_id = v_user;
  end if;

  return v_tenant;
end;
$$;

-- Returns the raw invitation token once. Only its SHA-256 hash is stored.
create function public.create_invitation(p_tenant uuid, p_email text, p_role public.member_role)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_limit integer;
  v_used integer;
  v_token text;
begin
  if not private.has_permission(p_tenant, 'members.manage') then
    raise exception 'You do not have permission to invite people.' using errcode = '42501', hint = 'forbidden';
  end if;
  if not private.tenant_can_write(p_tenant) then
    raise exception 'This workspace is read-only until the subscription is renewed.' using errcode = 'P0001', hint = 'read_only';
  end if;
  if p_role = 'owner' then
    raise exception 'A business has one owner. Invite as admin instead.' using errcode = 'P0001', hint = 'invalid_role';
  end if;
  if p_role = 'admin' and private.member_role(p_tenant) <> 'owner' then
    raise exception 'Only the owner can invite admins.' using errcode = '42501', hint = 'forbidden';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = 'P0001', hint = 'invalid_email';
  end if;
  if exists (
    select 1 from public.memberships m join auth.users u on u.id = m.user_id
    where m.tenant_id = p_tenant and lower(u.email) = v_email and m.status = 'active' and m.deleted_at is null
  ) then
    raise exception 'This person is already a member.' using errcode = 'P0001', hint = 'already_member';
  end if;

  -- Logins on the plan = active members + open invitations.
  v_limit := private.plan_limit(p_tenant, 'logins');
  if v_limit is not null then
    select
      (select count(*) from public.memberships m
        where m.tenant_id = p_tenant and m.status = 'active' and m.deleted_at is null)
      + (select count(*) from public.invitations i
        where i.tenant_id = p_tenant and i.accepted_at is null and i.revoked_at is null
          and i.expires_at > now() and i.email <> v_email)
    into v_used;
    if v_used >= v_limit then
      raise exception 'Your plan allows % logins. Upgrade to invite more people.', v_limit
        using errcode = 'P0001', hint = 'plan_limit:logins';
    end if;
  end if;

  -- Re-inviting the same email replaces the earlier open invitation.
  update public.invitations set revoked_at = now()
  where tenant_id = p_tenant and email = v_email and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
  values (p_tenant, v_email, p_role, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user);

  return v_token;
end;
$$;

create function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to accept the invitation.' using errcode = '42501', hint = 'auth_required';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;

  select * into v_invite from public.invitations i
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;

  if not found or v_invite.revoked_at is not null then
    raise exception 'This invitation link is not valid. Ask for a new one.' using errcode = 'P0001', hint = 'invite_invalid';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'This invitation has already been used.' using errcode = 'P0001', hint = 'invite_used';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'This invitation has expired. Ask for a new one.' using errcode = 'P0001', hint = 'invite_expired';
  end if;
  if v_invite.email <> v_email then
    raise exception 'This invitation was sent to a different email address.' using errcode = '42501', hint = 'invite_wrong_email';
  end if;

  insert into public.memberships (tenant_id, user_id, role, status, created_by)
  values (v_invite.tenant_id, v_user, v_invite.role, 'active', v_invite.invited_by)
  on conflict (tenant_id, user_id) do update
    set role = excluded.role, status = 'active', permissions = '{}'::jsonb, deleted_at = null
    where public.memberships.role <> 'owner';

  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;
  return v_invite.tenant_id;
end;
$$;

create function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.invitations where id = p_invitation;
  if v_tenant is null or not private.has_permission(v_tenant, 'members.manage') then
    raise exception 'Invitation not found.' using errcode = 'P0001', hint = 'not_found';
  end if;
  update public.invitations set revoked_at = now()
  where id = p_invitation and accepted_at is null and revoked_at is null;
end;
$$;

-- Shared checks for changing another member.
create function private.lock_target_member(p_membership uuid)
returns public.memberships
language plpgsql security definer
set search_path = ''
as $$
declare
  v_target public.memberships%rowtype;
begin
  select * into v_target from public.memberships where id = p_membership for update;
  if not found or not private.has_permission(v_target.tenant_id, 'members.manage') then
    raise exception 'Member not found.' using errcode = 'P0001', hint = 'not_found';
  end if;
  if v_target.user_id = auth.uid() then
    raise exception 'You cannot change your own access.' using errcode = 'P0001', hint = 'self_change';
  end if;
  if v_target.role = 'owner' then
    raise exception 'The owner''s access cannot be changed.' using errcode = '42501', hint = 'owner_protected';
  end if;
  if v_target.role = 'admin' and private.member_role(v_target.tenant_id) <> 'owner' then
    raise exception 'Only the owner can change an admin.' using errcode = '42501', hint = 'forbidden';
  end if;
  return v_target;
end;
$$;

create function public.change_member_role(p_membership uuid, p_role public.member_role)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_target public.memberships := private.lock_target_member(p_membership);
begin
  if p_role = 'owner' then
    raise exception 'Ownership cannot be given this way.' using errcode = 'P0001', hint = 'invalid_role';
  end if;
  if p_role = 'admin' and private.member_role(v_target.tenant_id) <> 'owner' then
    raise exception 'Only the owner can make someone an admin.' using errcode = '42501', hint = 'forbidden';
  end if;
  update public.memberships set role = p_role where id = v_target.id;
end;
$$;

-- Employee permission switches, e.g. {"reports.view": true}.
create function public.set_member_permissions(p_membership uuid, p_permissions jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_target public.memberships := private.lock_target_member(p_membership);
  v_key text;
begin
  if jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Permissions must be a list of switches.' using errcode = 'P0001', hint = 'invalid_permissions';
  end if;
  for v_key in select jsonb_object_keys(p_permissions) loop
    if v_key in ('billing.manage', 'members.manage', 'settings.manage')
       or jsonb_typeof(p_permissions -> v_key) <> 'boolean' then
      raise exception 'Permission % cannot be given to an employee.', v_key using errcode = 'P0001', hint = 'invalid_permissions';
    end if;
  end loop;
  update public.memberships set permissions = p_permissions where id = v_target.id;
end;
$$;

create function public.revoke_member(p_membership uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_target public.memberships := private.lock_target_member(p_membership);
begin
  update public.memberships set status = 'revoked' where id = v_target.id;
  update public.employees set membership_id = null
  where membership_id = v_target.id and tenant_id = v_target.tenant_id;
end;
$$;

revoke execute on function
  public.create_business(text, text),
  public.create_invitation(uuid, text, public.member_role),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.change_member_role(uuid, public.member_role),
  public.set_member_permissions(uuid, jsonb),
  public.revoke_member(uuid)
from public, anon;

grant execute on function
  public.create_business(text, text),
  public.create_invitation(uuid, text, public.member_role),
  public.accept_invitation(text),
  public.revoke_invitation(uuid),
  public.change_member_role(uuid, public.member_role),
  public.set_member_permissions(uuid, jsonb),
  public.revoke_member(uuid)
to authenticated;

revoke execute on function private.lock_target_member(uuid) from public;
