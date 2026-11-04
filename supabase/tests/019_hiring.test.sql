-- Step 8 (HIR-01 → HIR-08): placeholder letter templates, who sees candidates, stage rules,
-- sending an offer, the single-use pre-boarding link and session, click-to-sign by a
-- candidate, the pre-boarding portal writes, Convert to employee, probation reminders,
-- review and Owner approval, and rejecting a candidate.
begin;
create extension if not exists pgtap with schema extensions;

select plan(51);

-- Tenant I: owner, HR admin, and a manager (employee in branch 1). The token below is the
-- plain link the candidate would get; only its SHA-256 is stored.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000a9001', 'owner-i@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a9002', 'hr-i@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a9003', 'manager-i@example.test', 'authenticated', 'authenticated');
insert into public.tenants (id, legal_name, default_locale) values ('00000000-0000-0000-0000-0000000000a9', 'Tenant I', 'en');
insert into public.branches (id, tenant_id, name) values
  ('00000000-0000-0000-0000-0000000a9b01', '00000000-0000-0000-0000-0000000000a9', 'One');
insert into public.job_roles (id, tenant_id, name, is_clinical) values
  ('00000000-0000-0000-0000-0000000a9701', '00000000-0000-0000-0000-0000000000a9', 'Occupational Therapist', true);
insert into public.role_credential_requirements (job_role_id, credential_type_id, requirement)
  select '00000000-0000-0000-0000-0000000a9701', t.id, 'mandatory' from public.credential_types t
  where t.tenant_id = '00000000-0000-0000-0000-0000000000a9' and t.code = 'BLS';
insert into public.employees (id, tenant_id, full_name, branch_id) values
  ('00000000-0000-0000-0000-0000000a9e01', '00000000-0000-0000-0000-0000000000a9', 'Mira Manager', '00000000-0000-0000-0000-0000000a9b01');
insert into public.memberships (tenant_id, user_id, role, employee_id, branch_ids) values
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000a9001', 'owner', null, '{}'),
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000a9002', 'hr_admin', null, '{}'),
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000a9003', 'manager', '00000000-0000-0000-0000-0000000a9e01',
   '{00000000-0000-0000-0000-0000000a9b01}');
select set_config('test.bls', (select id::text from public.credential_types
  where tenant_id = '00000000-0000-0000-0000-0000000000a9' and code = 'BLS'), true);

-- ── HIR-03 placeholder templates ──
select is((select count(*)::int from public.letter_templates
  where tenant_id = '00000000-0000-0000-0000-0000000000a9' and is_draft), 8,
  'a new company gets offer, contract, confirmation and extension templates in EN and MS, marked draft');
select ok((select body like '%45 hours a week%' and body like '%1.5 times the hourly rate%'
  and body like '%98 consecutive days%' and body like '%8 weeks with 5 years%'
  and body like '%11 paid public holidays%'
  from public.letter_templates
  where tenant_id = '00000000-0000-0000-0000-0000000000a9' and kind = 'contract' and locale = 'en'),
  'the placeholder contract carries the Employment Act minimum hours, overtime, leave and notice terms');
select ok((select body like '%45 jam seminggu%' and body like '%98 hari berturut-turut%'
  from public.letter_templates
  where tenant_id = '00000000-0000-0000-0000-0000000000a9' and kind = 'contract' and locale = 'ms'),
  'the Malay contract carries the same terms');

-- ── HR: opening, candidate, offer ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9002","role":"authenticated","aal":"aal2"}', true);

select lives_ok($$ insert into public.job_openings (tenant_id, job_role_id, title, employment_type, pay_model, salary_min, salary_max)
  values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000a9701', 'Occupational Therapist', 'full_time', 'monthly', 4000, 5000) $$,
  'HR creates a job opening');
select lives_ok($$ insert into public.candidates (tenant_id, job_opening_id, full_name, email)
  select '00000000-0000-0000-0000-0000000000a9', id, 'Siti Nur Aisyah', 'Siti@Example.Test' from public.job_openings $$,
  'HR adds a candidate');
select set_config('test.candidate', (select id::text from public.candidates where full_name = 'Siti Nur Aisyah'), true);
select throws_ok($$ select preboarding_token_hash from public.candidates $$, '42501', null,
  'link and session hashes are never readable');
select throws_ok($$ update public.candidates set stage = 'hired' $$, '22023', null,
  'Hired only comes from Convert to employee');

select lives_ok(format($$ insert into public.offers (candidate_id, job_title, job_role_id, branch_id, manager_id, employment_type,
  pay_model, basic_salary, normal_hours_per_day, work_days_per_week, start_date, probation_months)
  values (%L, 'Occupational Therapist', '00000000-0000-0000-0000-0000000a9701', '00000000-0000-0000-0000-0000000a9b01',
  '00000000-0000-0000-0000-0000000a9e01', 'full_time', 'monthly', 4500, 8, 5.5, '2027-01-04', 3) $$,
  current_setting('test.candidate')), 'HR drafts an offer');
select set_config('test.offer', (select id::text from public.offers), true);
select throws_ok(format($$ select public.record_offer_sent(%L, %L, repeat('a', 64), repeat('b', 64)) $$,
  current_setting('test.offer'), '00000000-0000-0000-0000-0000000000a9/offers/' || current_setting('test.offer') || '/offer.pdf'),
  '22023', null, 'an offer is only sent once its letter is stored');

reset role;
insert into storage.objects (bucket_id, name) values
  ('letters', '00000000-0000-0000-0000-0000000000a9/offers/' || current_setting('test.offer') || '/offer.pdf');
set local role authenticated;
select lives_ok(format($$ select public.record_offer_sent(%L, %L, repeat('a', 64),
  '9b1f159942001144ec90de5790575204e16828b0efee205d81e2a84b49dd7269') $$,
  current_setting('test.offer'), '00000000-0000-0000-0000-0000000000a9/offers/' || current_setting('test.offer') || '/offer.pdf'),
  'HR sends the offer');
select results_eq($$ select c.stage::text, o.status, o.expires_at::date - now()::date from public.candidates c join public.offers o on o.candidate_id = c.id $$,
  $$ values ('offer', 'sent', 14) $$, 'the candidate moves to Offer; the link lasts 14 days');
select throws_ok($$ update public.offers set job_title = 'x' $$, '22023', null, 'a sent offer cannot be edited');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.candidates), 0, 'managers do not see candidates');

-- ── HIR-04 the candidate (no account) ──
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.preboarding_redeem('not-the-token') $$, 'P0002', null, 'a wrong link opens nothing');
select lives_ok($$ select set_config('test.session',
  public.preboarding_redeem('test-token-for-step-8-preboarding-link') ->> 'session', true) $$,
  'the emailed link opens a pre-boarding session');
select throws_ok($$ select public.preboarding_redeem('test-token-for-step-8-preboarding-link') $$, '22023', null,
  'the link works only once');
select results_eq($$ select c -> 'offer' ->> 'status', c -> 'employee' = 'null'::jsonb, jsonb_array_length(c -> 'required')
  from public.preboarding_context(current_setting('test.session')) c $$,
  $$ values ('sent', true, 1) $$, 'the portal shows the offer and the credentials the role needs');
select throws_ok($$ select public.preboarding_save_personal(current_setting('test.session'), '{}') $$, '22023', null,
  'details come after accepting the offer');
select throws_ok($$ select public.preboarding_accept_offer(current_setting('test.session'), '00000000-0000-0000-0000-0000000a95a1',
  'Someone Else', 'I agree', '1.2.3.4', 'test') $$, '22023', null, 'the typed name must match the offer');
select throws_ok($$ select public.preboarding_accept_offer(current_setting('test.session'), '00000000-0000-0000-0000-0000000a95a1',
  'siti  nur AISYAH', 'I agree', '1.2.3.4', 'test') $$, '22023', null, 'accepting needs the stamped signed copy');
select throws_ok($$ select count(*) from public.candidates $$, '42501', null, 'the public role cannot read candidates');

reset role;
insert into storage.objects (bucket_id, name) values
  ('signed', '00000000-0000-0000-0000-0000000000a9/offer/' || current_setting('test.offer') || '/00000000-0000-0000-0000-0000000a95a1.pdf');
set local role anon;
select lives_ok($$ select set_config('test.employee', public.preboarding_accept_offer(current_setting('test.session'),
  '00000000-0000-0000-0000-0000000a95a1', 'siti  nur AISYAH', 'I agree', '1.2.3.4', 'test')::text, true) $$,
  'the candidate accepts by click-to-sign');
select lives_ok($$ select public.preboarding_save_personal(current_setting('test.session'),
  '{"full_name":"Siti Nur Aisyah","id_type":"mykad","id_no":"950512145432","nationality":"MY","date_of_birth":"1995-05-12",
    "gender":"female","phone":"012-345 6789","address":"Kuala Lumpur","emergency_contact":{"name":"Mak","phone":"013-111 2222"}}') $$,
  'personal details and emergency contact are saved');
select lives_ok($$ select public.preboarding_save_statutory(current_setting('test.session'),
  '{"epf_no":"12345678","tax_no":"SG1234567890","pcb_category":"single","children_count_eligible":0}') $$,
  'statutory numbers are saved');
select lives_ok($$ select public.preboarding_save_bank(current_setting('test.session'), 'MBB', '1234 5678 90', 'SITI NUR AISYAH') $$,
  'the salary account is saved (encrypted)');
select lives_ok($$ select public.preboarding_save_dependents(current_setting('test.session'),
  '[{"name":"Adam","relationship":"child","date_of_birth":"2020-01-01"}]') $$, 'dependents are saved');
select lives_ok($$ select set_config('test.cred', public.preboarding_save_credential(current_setting('test.session'), null,
  jsonb_build_object('credential_type_id', current_setting('test.bls'), 'effective_date', '2026-06-01', 'expiry_date', '2028-06-01'))::text, true) $$,
  'a credential draft is started');
select throws_ok($$ select public.preboarding_submit_credential(current_setting('test.session'), current_setting('test.cred')::uuid) $$,
  '22023', null, 'a credential needs a file before it goes to HR');
select is((select folder from public.preboarding_credential_upload_target(current_setting('test.session'), current_setting('test.cred')::uuid)),
  '00000000-0000-0000-0000-0000000000a9/' || current_setting('test.employee') || '/' || current_setting('test.cred') || '/',
  'uploads go to the employee''s own credential folder');

reset role;
insert into public.credential_files (tenant_id, staff_credential_id, file_path, mime, size_bytes)
values ('00000000-0000-0000-0000-0000000000a9', current_setting('test.cred')::uuid, 'x/bls.pdf', 'application/pdf', 100);
set local role anon;
select is(public.preboarding_submit_credential(current_setting('test.session'), current_setting('test.cred')::uuid), 'pending',
  'with a file it goes to HR as Pending');
select results_eq($$ select c -> 'employee' ->> 'id_no_last4', c -> 'bank' ->> 'account_no_last4',
  c -> 'credentials' -> 0 ->> 'status', jsonb_array_length(c -> 'dependents')
  from public.preboarding_context(current_setting('test.session')) c $$,
  $$ values ('5432', '7890', 'pending', 1) $$, 'the portal shows what was saved, masked');
select lives_ok($$ select public.preboarding_submit(current_setting('test.session')) $$, 'the candidate tells HR they are done');

reset role;
select is((select count(*)::int from public.notifications
  where user_id = '00000000-0000-0000-0000-0000000a9002' and template in ('offer_accepted', 'preboarding_completed')), 2,
  'HR hears when the offer is accepted and pre-boarding is done');
select is((select status::text from public.employees where id = current_setting('test.employee')::uuid), 'preboarding',
  'until converted, the new hire is a pre-boarding employee');

-- ── HIR-05 / HIR-06 Convert to employee ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9002","role":"authenticated","aal":"aal2"}', true);
select lives_ok(format($$ select public.convert_candidate(%L) $$, current_setting('test.candidate')), 'HR converts the candidate');
select results_eq(format($$ select e.status::text, r.start_date, r.probation_end, r.basic_salary from public.employees e
  join public.employment_records r on r.employee_id = e.id and r.is_current where e.id = %L $$, current_setting('test.employee')),
  $$ values ('active', '2027-01-04'::date, '2027-04-03'::date, 4500.00::numeric(12,2)) $$,
  'the employee is active with the contract from the offer');
select is((select count(*)::int from public.onboarding_tasks where employee_id = current_setting('test.employee')::uuid), 8,
  'an onboarding checklist is created');
select results_eq(format($$ select invited_email, role::text from public.memberships where employee_id = %L $$, current_setting('test.employee')),
  $$ values ('siti@example.test', 'staff') $$, 'they are invited to Rakan as staff');
select is((select first_hire_date from public.tenants where id = '00000000-0000-0000-0000-0000000000a9'), '2027-01-04'::date,
  'the first hire sets the setup checklist''s first hire date');
select results_eq($$ select stage::text, converted_at is not null from public.candidates where full_name = 'Siti Nur Aisyah' $$,
  $$ values ('hired', true) $$, 'the candidate is Hired');

reset role;
set local role anon;
select throws_ok($$ select public.preboarding_context(current_setting('test.session')) $$, '42501', null,
  'the pre-boarding session ends at conversion');

-- ── HIR-07 probation ──
reset role;
select is(public.probation_reminders('2027-03-04'), 1, '30 days before the end, a reminder goes out');
select is((select count(*)::int from public.notifications
  where user_id = '00000000-0000-0000-0000-0000000a9003' and template = 'probation_due'), 1, 'the manager gets it');
select is(public.probation_reminders('2027-03-15'), 0, 'reminders are not repeated');
select is(public.probation_reminders('2027-03-20'), 1, 'the next one goes out 14 days before');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9003","role":"authenticated","aal":"aal1"}', true);
select lives_ok(format($$ select public.submit_probation_review(%L,
  '{"quality":4,"skills":5,"reliability":4,"teamwork":5,"conduct":5}', 'Strong start', 'confirm', null) $$,
  current_setting('test.employee')), 'the manager submits the review');
select results_eq($$ select status, approval_id is not null from public.probation_reviews $$,
  $$ values ('submitted', true) $$, 'it waits for the Owner''s approval');
select throws_ok(format($$ select public.submit_probation_review(%L,
  '{"quality":4,"skills":5,"reliability":4,"teamwork":5,"conduct":5}', 'Again', 'confirm', null) $$,
  current_setting('test.employee')), '23505', null, 'one review waits at a time');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9001","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ select public.act_on_approval((select approval_id from public.probation_reviews), 'approved', null) $$,
  'the Owner approves');
select results_eq(format($$ select r.confirmed_on, p.status from public.employment_records r
  join public.probation_reviews p on p.employment_record_id = r.id where r.employee_id = %L $$, current_setting('test.employee')),
  $$ values ('2027-04-03'::date, 'approved') $$, 'approval confirms the appointment (confirmed_on)');

-- ── Rejecting closes the link and the offer ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a9002","role":"authenticated","aal":"aal2"}', true);
insert into public.candidates (tenant_id, job_opening_id, full_name, email)
  select '00000000-0000-0000-0000-0000000000a9', id, 'Second Person', 'second@example.test' from public.job_openings;
insert into public.offers (candidate_id, job_title, employment_type, pay_model, basic_salary, normal_hours_per_day, work_days_per_week, start_date)
  select id, 'OT', 'full_time', 'monthly', 4000, 8, 5, '2027-02-01' from public.candidates where full_name = 'Second Person';
update public.candidates set stage = 'rejected', rejected_reason = 'Declined' where full_name = 'Second Person';
select results_eq($$ select o.status from public.offers o join public.candidates c on c.id = o.candidate_id
  where c.full_name = 'Second Person' $$, $$ values ('withdrawn') $$, 'rejecting withdraws an open offer');

select * from finish();
rollback;
