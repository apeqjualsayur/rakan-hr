-- Step 3 (FND-01, FND-02): every enum in data-model.md §4.
-- Later steps use the ones they need; adding them all now keeps §4 the single source.

create type public.app_role as enum (
  'owner', 'hr_admin', 'payroll_approver', 'manager', 'staff', 'auditor'
);
create type public.employee_status as enum ('preboarding', 'active', 'on_notice', 'left');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'locum_contractor');
create type public.pay_model as enum ('monthly', 'hourly', 'per_session');
create type public.id_type as enum ('mykad', 'passport');
create type public.pcb_category as enum (
  'single', 'married_spouse_not_working', 'married_spouse_working'
);
create type public.credential_category as enum (
  'registration', 'practising_cert', 'clinical_cert', 'vaccination', 'safeguarding', 'other'
);
create type public.credential_status as enum (
  'draft', 'pending', 'verified', 'rejected', 'superseded', 'withdrawn'
);
create type public.enforcement_mode as enum ('soft', 'hard');
create type public.candidate_stage as enum ('applied', 'interview', 'offer', 'hired', 'rejected');
create type public.payroll_status as enum (
  'draft', 'calculated', 'reviewed', 'approved', 'locked', 'paid'
);
create type public.checklist_status as enum ('not_started', 'in_progress', 'done', 'not_applicable');
