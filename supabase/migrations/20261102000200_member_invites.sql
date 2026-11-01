-- Step 4 (Settings > Users): invite emails, and rules that keep the company manageable.
-- Inviting = inserting a membership with invited_email (Step 3 links it on first sign-in).
-- Removing someone who has signed in = deactivating, never deleting (keeps history).

alter table public.memberships
  add column invite_sent_at timestamptz,
  add column invite_error text;

-- Asks the send-notification-email Edge Function to email an invite (pg_net sends it after
-- commit). Uses the same Vault secrets as notifications; if they are missing the invite
-- still works, the person just isn't emailed.
create or replace function public.queue_invite_email(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'notify_webhook_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('invite_id', p_membership_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    )
  );
end;
$$;

revoke execute on function public.queue_invite_email(uuid) from public, anon, authenticated;

create or replace function public.memberships_send_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.invited_email is not null and new.is_active then
    perform public.queue_invite_email(new.id);
  end if;
  return null;
end;
$$;

create trigger memberships_send_invite
  after insert on public.memberships
  for each row execute function public.memberships_send_invite();

-- "Resend invite" on the Users screen. Owner only, own tenant only.
create or replace function public.resend_invite(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() is distinct from 'owner' then
    raise exception 'Only the owner can send invites' using errcode = '42501';
  end if;

  update public.memberships
  set invite_error = null
  where id = p_membership_id
    and tenant_id = public.auth_tenant_id()
    and is_active
    and invited_email is not null;
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  perform public.queue_invite_email(p_membership_id);
end;
$$;

revoke execute on function public.resend_invite(uuid) from public, anon;
grant execute on function public.resend_invite(uuid) to authenticated;

-- The company must always keep at least one active Owner: demoting or deactivating the
-- last one is refused (for the app, the seed script and SQL alike).
create or replace function public.memberships_keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.is_active
     and not (new.role = 'owner' and new.is_active)
     and not exists (
       select 1 from public.memberships m
       where m.tenant_id = old.tenant_id
         and m.id <> old.id
         and m.role = 'owner'
         and m.is_active
     ) then
    raise exception 'The company must keep at least one active Owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger memberships_keep_an_owner
  before update of role, is_active on public.memberships
  for each row execute function public.memberships_keep_an_owner();

-- Only invites nobody has accepted yet can be deleted; members who signed in are
-- deactivated instead (replaces the Step 3 policy).
drop policy memberships_delete on public.memberships;
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and public.auth_role() = 'owner'
    and user_id is null
  );
