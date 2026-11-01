-- Step 3 (FND-07): the single notify() every later step reuses (approvals, credential
-- reminders, payroll, …). It writes the in-app notification; an AFTER INSERT trigger then
-- asks the send-notification-email Edge Function to email it through Resend.
--
-- The Edge Function URL and shared secret live in Vault (set by `npm run notify:setup`):
--   notify_function_url, notify_webhook_secret
-- If they are missing, notifications still appear in the bell; only email is skipped.

create extension if not exists pg_net;

-- Template keys must exist in messages/*.json (Notifications.templates) and in
-- supabase/functions/_shared/emails/templates.ts.
create or replace function public.notify(
  p_user_id uuid,
  p_template text,
  p_data jsonb default '{}'::jsonb,
  p_link text default null,
  p_channel text default 'in_app_email'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_id uuid;
begin
  select m.tenant_id into v_tenant_id
  from public.memberships m
  where m.user_id = p_user_id and m.is_active
  limit 1;

  -- No active membership (e.g. deactivated user): nobody to notify.
  if v_tenant_id is null then
    return null;
  end if;

  insert into public.notifications (tenant_id, user_id, template, data, link, channel)
  values (v_tenant_id, p_user_id, p_template, coalesce(p_data, '{}'::jsonb), p_link, p_channel)
  returning id into v_id;

  return v_id;
end;
$$;

-- Only database code (approval engine, cron jobs, other SECURITY DEFINER functions) may
-- notify arbitrary users; signed-in users cannot call it directly.
revoke execute on function public.notify(uuid, text, jsonb, text, text) from public, anon, authenticated;

-- Step 3 check: "Bell icon shows a test notification". Notifies only the caller.
create or replace function public.send_test_notification()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_tenant_id() is null then
    raise exception 'No active membership' using errcode = '42501';
  end if;
  return public.notify(auth.uid(), 'test', jsonb_build_object('sent_at', now()));
end;
$$;

revoke execute on function public.send_test_notification() from public, anon;
grant execute on function public.send_test_notification() to authenticated;

-- Email delivery: queue an HTTP call to the Edge Function (pg_net sends it after commit).
create or replace function public.notifications_queue_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.channel <> 'in_app_email' then
    return null;
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'notify_function_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'notify_webhook_secret';

  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    )
  );
  return null;
end;
$$;

create trigger notifications_queue_email
  after insert on public.notifications
  for each row execute function public.notifications_queue_email();
