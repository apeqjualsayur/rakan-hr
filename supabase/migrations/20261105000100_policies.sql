-- Step 7 (POL-01 → POL-04, CMP-05): announcements with read receipts, the versioned policy
-- library, click-to-sign signatures (data-model.md §3.4b) and the private `policies` and
-- `signed` buckets (§6). Jobs: announcement notifications (every 15 min) and
-- policy_ack_reminders (daily 09:00 MYT, §7).
--
-- Audience (announcements and policies): {"type": "all"}, {"type": "branches", "ids": [...]}
-- or {"type": "job_roles", "ids": [...]}. Members without an employee record (e.g. an owner)
-- are only in "all".

create or replace function public.valid_audience(p_audience jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_audience) = 'object'
    and (
      p_audience ->> 'type' = 'all'
      or (p_audience ->> 'type' in ('branches', 'job_roles')
          and jsonb_typeof(p_audience -> 'ids') = 'array'
          and jsonb_array_length(p_audience -> 'ids') > 0)
    );
$$;

create or replace function public.audience_includes(p_audience jsonb, p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_audience ->> 'type'
    when 'all' then true
    when 'branches' then exists (
      select 1 from public.employees e
      where e.id = p_employee_id
        and e.branch_id::text in (select jsonb_array_elements_text(p_audience -> 'ids'))
    )
    when 'job_roles' then exists (
      select 1 from public.employees e
      where e.id = p_employee_id
        and e.job_role_id::text in (select jsonb_array_elements_text(p_audience -> 'ids'))
    )
    else false
  end;
$$;

-- Admin-side links go to the admin shell, everyone else to the staff shell.
create or replace function public.home_area(p_role public.app_role)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_role in ('owner', 'hr_admin', 'payroll_approver', 'auditor')
    then '/admin' else '/staff' end;
$$;

-- ── POL-01 announcements ────────────────────────────────────────────────────────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title_en text not null check (btrim(title_en) <> '' and char_length(title_en) <= 200),
  title_ms text not null check (btrim(title_ms) <> '' and char_length(title_ms) <= 200),
  body_en text not null check (char_length(body_en) <= 5000),
  body_ms text not null check (char_length(body_ms) <= 5000),
  audience jsonb not null default '{"type": "all"}'::jsonb check (public.valid_audience(audience)),
  pinned boolean not null default false,
  publish_at timestamptz not null default now(),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index announcements_tenant_publish_idx on public.announcements (tenant_id, publish_at desc);
create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  read_at timestamptz not null default now(),
  constraint announcement_reads_key unique (announcement_id, user_id)
);

-- Who may see an announcement now: owner / HR / auditor always; others once published,
-- when they are in its audience.
create or replace function public.can_see_announcement(p_announcement public.announcements)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_announcement.tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'auditor')
      or (p_announcement.publish_at <= now()
          and public.audience_includes(p_announcement.audience, public.auth_employee_id()))
    );
$$;

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
revoke all on public.announcements, public.announcement_reads from anon;

create policy announcements_select on public.announcements for select to authenticated
  using (public.can_see_announcement(announcements));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy announcements_update on public.announcements for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy announcements_delete on public.announcements for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
revoke update on public.announcements from authenticated;
grant update (title_en, title_ms, body_en, body_ms, audience, pinned, publish_at)
  on public.announcements to authenticated;

create policy announcement_reads_select on public.announcement_reads for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (user_id = auth.uid() or public.auth_role() in ('owner', 'hr_admin', 'auditor'))
  );
revoke insert, update, delete on public.announcement_reads from authenticated;

-- Read receipt: the viewer marks what they have seen (once).
create or replace function public.mark_announcements_read(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.announcement_reads (tenant_id, announcement_id, user_id, employee_id)
  select a.tenant_id, a.id, auth.uid(), public.auth_employee_id()
  from public.announcements a
  where a.id = any (p_ids) and auth.uid() is not null and public.can_see_announcement(a)
  on conflict (announcement_id, user_id) do nothing;
$$;
revoke execute on function public.mark_announcements_read(uuid[]) from public, anon;
grant execute on function public.mark_announcements_read(uuid[]) to authenticated;

-- In-app notification to the audience once an announcement is published (now, or when its
-- scheduled time comes: the job below).
create or replace function public.announcement_notify_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_announcement public.announcements;
  v_member record;
  v_count integer := 0;
begin
  for v_announcement in
    select * from public.announcements
    where publish_at <= now() and notified_at is null
    for update skip locked
  loop
    for v_member in
      select m.user_id, m.role from public.memberships m
      where m.tenant_id = v_announcement.tenant_id and m.is_active and m.user_id is not null
        and m.user_id is distinct from v_announcement.created_by
        and public.audience_includes(v_announcement.audience, m.employee_id)
    loop
      perform public.notify(
        v_member.user_id, 'announcement',
        jsonb_build_object('announcement_id', v_announcement.id,
                           'title_en', v_announcement.title_en, 'title_ms', v_announcement.title_ms),
        public.home_area(v_member.role) || '/announcements',
        'in_app'
      );
    end loop;
    update public.announcements set notified_at = now() where id = v_announcement.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.announcement_notify_due() from public, anon, authenticated;

create or replace function public.announcements_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publish_at <= now() then
    perform public.announcement_notify_due();
  end if;
  return null;
end;
$$;
create trigger announcements_after_insert
  after insert on public.announcements
  for each row execute function public.announcements_after_insert();

-- ── POL-02 policy_documents (one row per version) ──────────────────────────────────────
create table public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  title_en text not null check (btrim(title_en) <> '' and char_length(title_en) <= 200),
  title_ms text not null check (btrim(title_ms) <> '' and char_length(title_ms) <= 200),
  version integer not null check (version > 0),
  file_path text not null,
  -- SHA-256 of the exact PDF, worked out by the server when it is published. Every
  -- signature records it, so a signature always points at these exact bytes.
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  audience jsonb not null default '{"type": "all"}'::jsonb check (public.valid_audience(audience)),
  requires_signature boolean not null default true,
  published_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint policy_documents_version_key unique (tenant_id, code, version)
);
create index policy_documents_current_idx
  on public.policy_documents (tenant_id, code) where superseded_at is null;

-- Numbers the version, keeps the file inside the company's folder for that policy, and
-- makes the PDPA notice apply to everyone.
create or replace function public.policy_documents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('policy:' || new.tenant_id || ':' || new.code));
  select coalesce(max(d.version), 0) + 1 into new.version
  from public.policy_documents d where d.tenant_id = new.tenant_id and d.code = new.code;
  if new.file_path not like new.tenant_id || '/' || new.code || '/%' then
    raise exception 'The file must be in this policy''s folder' using errcode = '22023';
  end if;
  if new.code = 'PDPA_NOTICE' then
    new.audience := '{"type": "all"}'::jsonb;
    new.requires_signature := true;
  end if;
  new.published_at := now();
  new.superseded_at := null;
  return new;
end;
$$;
create trigger policy_documents_before_insert
  before insert on public.policy_documents
  for each row execute function public.policy_documents_before_insert();

-- POL-02: a new version replaces the old one and asks its audience to sign again.
create or replace function public.policy_documents_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
begin
  update public.policy_documents
  set superseded_at = now()
  where tenant_id = new.tenant_id and code = new.code and id <> new.id and superseded_at is null;

  if new.requires_signature then
    for v_member in
      select m.user_id, m.role from public.memberships m
      where m.tenant_id = new.tenant_id and m.is_active and m.user_id is not null
        and m.user_id is distinct from new.created_by
        and public.audience_includes(new.audience, m.employee_id)
    loop
      perform public.notify(
        v_member.user_id, 'policy_published',
        jsonb_build_object('policy_id', new.id, 'title_en', new.title_en,
                           'title_ms', new.title_ms, 'version', new.version),
        case when new.code = 'PDPA_NOTICE' then '/privacy-notice'
             else public.home_area(v_member.role) || '/policies/' || new.id end
      );
    end loop;
  end if;
  return null;
end;
$$;
create trigger policy_documents_after_insert
  after insert on public.policy_documents
  for each row execute function public.policy_documents_after_insert();

-- ── POL-03 signatures 🔒 (generic; insert-only) ─────────────────────────────────────────
-- entity_type policy_document now; offer / contract / probation_letter in Step 8.
create table public.signatures (
  id uuid primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity_type text not null check (entity_type in ('policy_document', 'offer', 'contract', 'probation_letter')),
  entity_id uuid not null,
  signer_user_id uuid references auth.users (id) on delete set null,
  signer_employee_id uuid references public.employees (id) on delete set null,
  signer_candidate_id uuid, -- FK added with candidates (Step 8)
  typed_name text not null check (btrim(typed_name) <> '' and char_length(typed_name) <= 200),
  consent_text text not null check (btrim(consent_text) <> ''),
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text check (char_length(user_agent) <= 500),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  signed_pdf_path text not null,
  created_at timestamptz not null default now(),
  constraint signatures_one_per_signer unique (entity_type, entity_id, signer_user_id)
);
create index signatures_entity_idx on public.signatures (entity_type, entity_id);
create index signatures_signer_idx on public.signatures (signer_user_id);

select audit.enable('public.signatures');

-- Names match whatever the spacing or capitals: "nurul  AINA binti ahmad".
create or replace function public.same_name(a text, b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(a), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(b), '\s+', ' ', 'g'));
$$;

-- Records a click-to-sign signature (POL-03). The server has already stamped the signature
-- page and stored the signed PDF in the `signed` bucket at
-- {tenant}/{entity_type}/{entity_id}/{signature id}.pdf, uploaded by this same user.
-- The document fingerprint comes from the published document, never from the caller.
create or replace function public.record_signature(
  p_signature_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_typed_name text,
  p_consent_text text,
  p_ip text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.auth_tenant_id();
  v_employee public.employees;
  v_document public.policy_documents;
  v_path text;
begin
  if v_tenant_id is null or auth.uid() is null then
    raise exception 'No active membership' using errcode = '42501';
  end if;
  if p_entity_type <> 'policy_document' then
    raise exception 'Signing % is not available yet', p_entity_type using errcode = '22023';
  end if;

  select * into v_document from public.policy_documents d
  where d.id = p_entity_id and d.tenant_id = v_tenant_id;
  if not found or v_document.superseded_at is not null or not v_document.requires_signature
     or not public.audience_includes(v_document.audience, public.auth_employee_id()) then
    raise exception 'This document is not waiting for your signature' using errcode = '22023',
      hint = 'not_signable';
  end if;

  select * into v_employee from public.employees where id = public.auth_employee_id();
  if btrim(coalesce(p_typed_name, '')) = '' or (
    v_employee.id is not null and not public.same_name(p_typed_name, v_employee.full_name)
  ) then
    raise exception 'Type your full name exactly as on your record' using errcode = '22023',
      hint = 'name_mismatch';
  end if;

  v_path := v_tenant_id || '/' || p_entity_type || '/' || p_entity_id || '/' || p_signature_id || '.pdf';
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'signed' and o.name = v_path and o.owner_id = auth.uid()::text
  ) then
    raise exception 'The signed copy was not stored' using errcode = '22023', hint = 'no_signed_pdf';
  end if;

  insert into public.signatures (id, tenant_id, entity_type, entity_id, signer_user_id,
    signer_employee_id, typed_name, consent_text, ip, user_agent, document_sha256, signed_pdf_path)
  values (p_signature_id, v_tenant_id, p_entity_type, p_entity_id, auth.uid(), v_employee.id,
    btrim(p_typed_name), p_consent_text, left(p_ip, 100), left(p_user_agent, 500),
    v_document.document_sha256, v_path);
  return p_signature_id;
exception
  when unique_violation then
    raise exception 'You have already signed this' using errcode = '23505', hint = 'already_signed';
end;
$$;
revoke execute on function public.record_signature(uuid, text, uuid, text, text, text, text) from public, anon;
grant execute on function public.record_signature(uuid, text, uuid, text, text, text, text) to authenticated;

-- What the signed-in user still has to sign (current versions in their audience).
create or replace function public.my_pending_policies()
returns setof public.policy_documents
language sql
stable
security definer
set search_path = ''
as $$
  select d.* from public.policy_documents d
  where d.tenant_id = public.auth_tenant_id()
    and auth.uid() is not null
    and d.superseded_at is null
    and d.requires_signature
    and public.audience_includes(d.audience, public.auth_employee_id())
    and not exists (
      select 1 from public.signatures s
      where s.entity_type = 'policy_document' and s.entity_id = d.id and s.signer_user_id = auth.uid()
    )
  order by (d.code = 'PDPA_NOTICE') desc, d.published_at;
$$;
revoke execute on function public.my_pending_policies() from public, anon;
grant execute on function public.my_pending_policies() to authenticated;

-- CMP-05: the PDPA notice the user must sign before using Rakan, if any.
create or replace function public.pending_privacy_notice()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.my_pending_policies() p where p.code = 'PDPA_NOTICE' limit 1;
$$;
revoke execute on function public.pending_privacy_notice() from public, anon;
grant execute on function public.pending_privacy_notice() to authenticated;

-- POL-04 tracker: everyone in a version's audience (with an employee record) and whether
-- they signed it. Owner, HR admin and auditor.
create or replace function public.policy_ack_status(p_policy_id uuid)
returns table (
  employee_id uuid,
  full_name text,
  employee_no text,
  has_account boolean,
  signature_id uuid,
  signed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.full_name, e.employee_no,
    exists (select 1 from public.memberships m where m.employee_id = e.id and m.is_active and m.user_id is not null),
    s.id, s.signed_at
  from public.policy_documents d
  join public.employees e on e.tenant_id = d.tenant_id
  left join lateral (
    select s.id, s.signed_at from public.signatures s
    where s.entity_type = 'policy_document' and s.entity_id = d.id and s.signer_employee_id = e.id
    order by s.signed_at limit 1
  ) s on true
  where d.id = p_policy_id
    and d.tenant_id = public.auth_tenant_id()
    and public.auth_role() in ('owner', 'hr_admin', 'auditor')
    and e.deleted_at is null
    and e.status in ('preboarding', 'active', 'on_notice')
    and public.audience_includes(d.audience, e.id)
  order by s.signed_at is not null, e.full_name;
$$;
revoke execute on function public.policy_ack_status(uuid) from public, anon;
grant execute on function public.policy_ack_status(uuid) to authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────
alter table public.policy_documents enable row level security;
alter table public.signatures enable row level security;
revoke all on public.policy_documents, public.signatures from anon;

-- Policies: owner / HR / auditor see all versions; others the versions addressed to them.
create policy policy_documents_select on public.policy_documents for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      public.auth_role() in ('owner', 'hr_admin', 'auditor')
      or public.audience_includes(audience, public.auth_employee_id())
    )
  );
create policy policy_documents_insert on public.policy_documents for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
-- Published versions never change (a correction is a new version).
revoke update, delete, truncate on public.policy_documents from authenticated;

-- Signatures: the signer sees their own; owner / HR / auditor see all. Insert-only, through
-- record_signature(); never updated or deleted.
create policy signatures_select on public.signatures for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (signer_user_id = auth.uid() or public.auth_role() in ('owner', 'hr_admin', 'auditor'))
  );
revoke insert, update, delete, truncate on public.signatures from authenticated;

-- ── POL-04 reminders (after 3 and 7 days unsigned) ──────────────────────────────────────
create table public.policy_ack_reminders_sent (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  policy_document_id uuid not null references public.policy_documents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  after_days integer not null,
  sent_at timestamptz not null default now(),
  constraint policy_ack_reminders_sent_key unique (policy_document_id, user_id, after_days)
);
alter table public.policy_ack_reminders_sent enable row level security;
revoke all on public.policy_ack_reminders_sent from anon;
create policy policy_ack_reminders_sent_select on public.policy_ack_reminders_sent
  for select to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin', 'auditor'));
revoke insert, update, delete on public.policy_ack_reminders_sent from authenticated;

-- Takes "now" so a test (or the owner) can simulate later days. Returns reminders sent.
create or replace function public.policy_ack_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_new integer;
  v_sent integer := 0;
begin
  for v_row in
    select d.id, d.tenant_id, d.code, d.title_en, d.title_ms, d.version, m.user_id, m.role,
           floor(extract(epoch from (p_now - d.published_at)) / 86400)::int as days
    from public.policy_documents d
    join public.memberships m
      on m.tenant_id = d.tenant_id and m.is_active and m.user_id is not null
    where d.superseded_at is null
      and d.requires_signature
      and public.audience_includes(d.audience, m.employee_id)
      and not exists (
        select 1 from public.signatures s
        where s.entity_type = 'policy_document' and s.entity_id = d.id and s.signer_user_id = m.user_id
      )
      and p_now - d.published_at >= interval '3 days'
  loop
    with marked as (
      insert into public.policy_ack_reminders_sent (tenant_id, policy_document_id, user_id, after_days)
      select v_row.tenant_id, v_row.id, v_row.user_id, mark
      from unnest(array[3, 7]) as mark
      where mark <= v_row.days
      on conflict do nothing
      returning 1
    )
    select count(*) into v_new from marked;
    if v_new > 0 then
      perform public.notify(
        v_row.user_id, 'policy_reminder',
        jsonb_build_object('policy_id', v_row.id, 'title_en', v_row.title_en,
                           'title_ms', v_row.title_ms, 'version', v_row.version, 'days', v_row.days),
        case when v_row.code = 'PDPA_NOTICE' then '/privacy-notice'
             else public.home_area(v_row.role) || '/policies/' || v_row.id end
      );
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.policy_ack_reminders(timestamptz) from public, anon, authenticated;

-- 09:00 MYT = 01:00 UTC. Scheduled announcements go out within 15 minutes of their time.
select cron.schedule('policy_ack_reminders', '0 1 * * *', 'select public.policy_ack_reminders()');
select cron.schedule('announcement_notify', '*/15 * * * *', 'select public.announcement_notify_due()');

-- ── Storage (data-model.md §6) ──────────────────────────────────────────────────────────
-- policies: {tenant_id}/{policy_code}/v{n}-{file}.pdf · members of the company read; owner /
--   HR upload. Never overwritten (a new version is a new file).
-- signed:   {tenant_id}/{entity_type}/{entity_id}/{signature_id}.pdf · the signer uploads
--   their own signed copy once; nobody updates or deletes it. Signer and owner / HR /
--   auditor read.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('policies', 'policies', false, 10485760, array['application/pdf']),
  ('signed', 'signed', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy policies_files_select on storage.objects for select to authenticated
  using (bucket_id = 'policies' and (storage.foldername(name))[1] = public.auth_tenant_id()::text);
create policy policies_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'policies'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and public.auth_role() in ('owner', 'hr_admin')
  );

create policy signed_files_select on storage.objects for select to authenticated
  using (
    bucket_id = 'signed'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (
      public.auth_role() in ('owner', 'hr_admin', 'auditor')
      or owner_id = auth.uid()::text
    )
  );
create policy signed_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signed'
    and (storage.foldername(name))[1] = public.auth_tenant_id()::text
    and (storage.foldername(name))[2] in ('policy_document', 'offer', 'contract', 'probation_letter')
    and storage.filename(name) ~ '^[0-9a-f-]{36}\.pdf$'
  );
