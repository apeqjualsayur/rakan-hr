-- Step 3 (FND-01, FND-02): RLS helper functions from data-model.md §5, sign-up gate and
-- invite linking. Helpers are SECURITY DEFINER so policies can read memberships without
-- recursing into memberships' own RLS.

-- The caller's active membership, or nothing. Owner / HR admin / payroll approver only get
-- their membership once they have passed MFA (JWT aal = aal2): until then every helper
-- returns null, so those roles see no tenant data at all (PRD §7 Security).
create or replace function public.current_membership()
returns setof public.memberships
language sql
stable
security definer
set search_path = ''
as $$
  select m.*
  from public.memberships m
  where m.user_id = auth.uid()
    and m.is_active
    and (
      m.role not in ('owner', 'hr_admin', 'payroll_approver')
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
  limit 1;
$$;

create or replace function public.auth_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tenant_id from public.current_membership();
$$;

create or replace function public.auth_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.current_membership();
$$;

create or replace function public.auth_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select employee_id from public.current_membership();
$$;

-- True if the employee is in the calling manager's branch scope (memberships.branch_ids).
-- public.employees arrives in Step 5; until then this function compiles but cannot run.
create or replace function public.is_manager_of(p_employee_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.memberships;
  v_branch_id uuid;
begin
  select * into v_membership from public.current_membership();
  if v_membership.role is distinct from 'manager' then
    return false;
  end if;

  select e.branch_id into v_branch_id
  from public.employees e
  where e.id = p_employee_id and e.tenant_id = v_membership.tenant_id;

  return v_branch_id is not null and v_branch_id = any (v_membership.branch_ids);
end;
$$;

-- Auth hook "Before User Created" (enable in Dashboard → Authentication → Hooks).
-- Only emails with an active membership invite may create an account, so the login
-- form can allow sign-up without opening Rakan to strangers.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if v_email is not null and exists (
    select 1 from public.memberships m
    where m.invited_email = v_email and m.is_active
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This email has not been invited to Rakan.'
    )
  );
end;
$$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- New auth user → link any invites for their email.
create or replace function public.link_invited_memberships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.memberships
  set user_id = new.id
  where invited_email = lower(new.email) and user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_created_link_memberships
  after insert on auth.users
  for each row execute function public.link_invited_memberships();

-- New invite for someone who already has an account → link it straight away.
create or replace function public.memberships_link_existing_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and new.invited_email is not null then
    select u.id into new.user_id from auth.users u where lower(u.email) = new.invited_email;
  end if;
  return new;
end;
$$;

create trigger memberships_link_existing_user
  before insert or update of invited_email on public.memberships
  for each row execute function public.memberships_link_existing_user();
