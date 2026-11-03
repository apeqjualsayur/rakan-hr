-- Step 7 (POL-01 → POL-04, CMP-05): announcement audiences and read receipts, policy
-- versions, click-to-sign (name check, signed copy required, insert-only), the PDPA gate,
-- the acknowledgement tracker and reminders.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- Tenant H: HR admin, staff Aina (branch 1, therapist) and Ben (branch 2).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000a8001', 'hr-h@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a8002', 'aina-h@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a8003', 'ben-h@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name) values ('00000000-0000-0000-0000-0000000000a8', 'Tenant H');
insert into public.branches (id, tenant_id, name) values
  ('00000000-0000-0000-0000-0000000a8b01', '00000000-0000-0000-0000-0000000000a8', 'One'),
  ('00000000-0000-0000-0000-0000000a8b02', '00000000-0000-0000-0000-0000000000a8', 'Two');
insert into public.employees (id, tenant_id, full_name, branch_id) values
  ('00000000-0000-0000-0000-0000000a8e01', '00000000-0000-0000-0000-0000000000a8', 'Nurul Aina binti Ahmad', '00000000-0000-0000-0000-0000000a8b01'),
  ('00000000-0000-0000-0000-0000000a8e02', '00000000-0000-0000-0000-0000000000a8', 'Ben Lee', '00000000-0000-0000-0000-0000000a8b02');
insert into public.memberships (tenant_id, user_id, role, employee_id) values
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000a8001', 'hr_admin', null),
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000a8002', 'staff', '00000000-0000-0000-0000-0000000a8e01'),
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-0000000a8003', 'staff', '00000000-0000-0000-0000-0000000a8e02');

select ok(not public.valid_audience('{"type":"branches","ids":[]}'), 'an audience needs at least one branch');
select ok(public.valid_audience('{"type":"all"}'), '"all" is a valid audience');

-- ── HR publishes ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a8001","role":"authenticated","aal":"aal2"}', true);

insert into public.announcements (id, tenant_id, title_en, title_ms, body_en, body_ms, audience) values
  ('00000000-0000-0000-0000-0000000a8a01', '00000000-0000-0000-0000-0000000000a8', 'Branch one', 'Cawangan satu', '', '',
   '{"type":"branches","ids":["00000000-0000-0000-0000-0000000a8b01"]}');
insert into public.announcements (id, tenant_id, title_en, title_ms, body_en, body_ms, publish_at) values
  ('00000000-0000-0000-0000-0000000a8a02', '00000000-0000-0000-0000-0000000000a8', 'Later', 'Nanti', '', '', now() + interval '2 days');
select is((select count(*)::int from public.announcements), 2, 'HR see scheduled announcements too');

insert into public.policy_documents (id, tenant_id, code, title_en, title_ms, version, file_path, document_sha256, audience) values
  ('00000000-0000-0000-0000-0000000a8d01', '00000000-0000-0000-0000-0000000000a8', 'PDPA_NOTICE', 'Privacy notice', 'Notis privasi', 99,
   '00000000-0000-0000-0000-0000000000a8/PDPA_NOTICE/v1.pdf', repeat('a', 64),
   '{"type":"branches","ids":["00000000-0000-0000-0000-0000000a8b02"]}');
select results_eq($$ select version, audience ->> 'type' from public.policy_documents where id = '00000000-0000-0000-0000-0000000a8d01' $$,
  $$ values (1, 'all') $$, 'versions are numbered by the database and the PDPA notice applies to everyone');
select throws_ok($$ insert into public.policy_documents (tenant_id, code, title_en, title_ms, version, file_path, document_sha256)
  values ('00000000-0000-0000-0000-0000000000a8', 'HANDBOOK', 'H', 'H', 1, 'elsewhere/x.pdf', repeat('b', 64)) $$,
  '22023', null, 'a policy file must sit in the company''s folder for it');
insert into public.policy_documents (id, tenant_id, code, title_en, title_ms, version, file_path, document_sha256) values
  ('00000000-0000-0000-0000-0000000a8d11', '00000000-0000-0000-0000-0000000000a8', 'HANDBOOK', 'Handbook', 'Buku panduan', 1,
   '00000000-0000-0000-0000-0000000000a8/HANDBOOK/v1.pdf', repeat('c', 64));
select throws_ok($$ update public.policy_documents set title_en = 'x' $$, '42501', null, 'published versions cannot be edited');

-- ── Aina (staff, branch 1) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a8002","role":"authenticated","aal":"aal1"}', true);
select results_eq($$ select title_en from public.announcements $$, array['Branch one'],
  'staff see published announcements for their branch only');
select is((select count(*)::int from public.notifications where template = 'announcement'), 1,
  'the audience is notified when an announcement is published');
select public.mark_announcements_read(array['00000000-0000-0000-0000-0000000a8a01'::uuid, '00000000-0000-0000-0000-0000000a8a02'::uuid]);
select is((select count(*)::int from public.announcement_reads), 1, 'read receipts only for announcements the reader can see');
select is((select count(*)::int from public.notifications where template = 'policy_published'), 2,
  'publishing a policy asks its audience to sign');
select is(public.pending_privacy_notice(), '00000000-0000-0000-0000-0000000a8d01'::uuid,
  'the PDPA notice must be signed before using Rakan');
select throws_ok($$ insert into public.policy_documents (tenant_id, code, title_en, title_ms, version, file_path, document_sha256)
  values ('00000000-0000-0000-0000-0000000000a8', 'X', 'X', 'X', 1, '00000000-0000-0000-0000-0000000000a8/X/v1.pdf', repeat('d', 64)) $$,
  '42501', null, 'staff cannot publish policies');

select throws_ok($$ select public.record_signature('00000000-0000-0000-0000-0000000a85a1', 'policy_document',
  '00000000-0000-0000-0000-0000000a8d01', 'Someone Else', 'I agree', '1.2.3.4', 'test') $$,
  '22023', null, 'the typed name must match the employee record');
select throws_ok($$ select public.record_signature('00000000-0000-0000-0000-0000000a85a1', 'policy_document',
  '00000000-0000-0000-0000-0000000a8d01', 'nurul  aina BINTI ahmad', 'I agree', '1.2.3.4', 'test') $$,
  '22023', null, 'a signature needs the stamped signed copy in storage first');

-- The server stores the signed copy as Aina (simulated here).
reset role;
insert into storage.objects (bucket_id, name, owner_id) values
  ('signed', '00000000-0000-0000-0000-0000000000a8/policy_document/00000000-0000-0000-0000-0000000a8d01/00000000-0000-0000-0000-0000000a85a1.pdf',
   '00000000-0000-0000-0000-0000000a8002');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a8002","role":"authenticated","aal":"aal1"}', true);

select lives_ok($$ select public.record_signature('00000000-0000-0000-0000-0000000a85a1', 'policy_document',
  '00000000-0000-0000-0000-0000000a8d01', 'nurul  aina BINTI ahmad', 'I agree', '1.2.3.4', 'test') $$,
  'staff sign with their name (spacing and capitals do not matter)');
select is((select document_sha256 from public.signatures where id = '00000000-0000-0000-0000-0000000a85a1'), repeat('a', 64),
  'the signature records the published document''s fingerprint');
select is(public.pending_privacy_notice(), null, 'once signed, the PDPA notice no longer blocks');
select throws_ok($$ select public.record_signature('00000000-0000-0000-0000-0000000a85a1', 'policy_document',
  '00000000-0000-0000-0000-0000000a8d01', 'Nurul Aina binti Ahmad', 'I agree', '1.2.3.4', 'test') $$,
  '23505', null, 'a document is signed once');
select throws_ok($$ update public.signatures set typed_name = 'x' $$, '42501', null, 'signatures cannot be changed');
select throws_ok($$ delete from public.signatures $$, '42501', null, 'signatures cannot be deleted');

-- ── Ben (another staff member) ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a8003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.signatures), 0, 'staff cannot see others'' signatures');
select is((select count(*)::int from public.announcements), 0, 'staff outside the audience see nothing');

-- ── Tracker, re-acknowledgement, reminders ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a8001","role":"authenticated","aal":"aal2"}', true);
select results_eq($$ select full_name, signature_id is not null from public.policy_ack_status('00000000-0000-0000-0000-0000000a8d01') order by 1 $$,
  $$ values ('Ben Lee', false), ('Nurul Aina binti Ahmad', true) $$, 'the tracker shows who has and hasn''t signed');
insert into public.policy_documents (id, tenant_id, code, title_en, title_ms, version, file_path, document_sha256) values
  ('00000000-0000-0000-0000-0000000a8d02', '00000000-0000-0000-0000-0000000000a8', 'PDPA_NOTICE', 'Privacy notice', 'Notis privasi', 1,
   '00000000-0000-0000-0000-0000000000a8/PDPA_NOTICE/v2.pdf', repeat('e', 64));
select ok((select superseded_at is not null from public.policy_documents where id = '00000000-0000-0000-0000-0000000a8d01'),
  'a new version replaces the old one');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a8002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select is(public.pending_privacy_notice(), '00000000-0000-0000-0000-0000000a8d02'::uuid, 'a new version must be signed again');
reset role;

select is((select public.policy_ack_reminders(now() + interval '4 days') >= 2), true, 'after 3 days the unsigned are reminded');
select is((select count(*)::int from public.policy_ack_reminders_sent
  where policy_document_id = '00000000-0000-0000-0000-0000000a8d11'
    and user_id = '00000000-0000-0000-0000-0000000a8002'), 1,
  'one reminder per person per mark');
select public.policy_ack_reminders(now() + interval '4 days');
select is((select count(*)::int from public.policy_ack_reminders_sent
  where policy_document_id = '00000000-0000-0000-0000-0000000a8d11'
    and user_id = '00000000-0000-0000-0000-0000000a8002'), 1,
  'reminders are never repeated');

select * from finish();
rollback;
