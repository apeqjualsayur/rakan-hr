-- Step 3 (FND-02): RLS on every table, per data-model.md §5.
-- Every policy is scoped to the caller's tenant via auth_tenant_id(). Approvals and
-- notifications are written only through SECURITY DEFINER functions (no insert policies).

alter table public.tenants enable row level security;
alter table public.branches enable row level security;
alter table public.memberships enable row level security;
alter table public.approvals enable row level security;
alter table public.approval_steps enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Signed-out visitors get nothing from these tables.
revoke all on public.tenants, public.branches, public.memberships, public.approvals,
  public.approval_steps, public.notifications, public.audit_log from anon;

-- tenants: members read their own tenant; only the owner edits it.
create policy tenants_select on public.tenants for select to authenticated
  using (id = public.auth_tenant_id());
create policy tenants_update on public.tenants for update to authenticated
  using (id = public.auth_tenant_id() and public.auth_role() = 'owner')
  with check (id = public.auth_tenant_id());

-- branches: members read; owner and HR admin manage.
create policy branches_select on public.branches for select to authenticated
  using (tenant_id = public.auth_tenant_id());
create policy branches_insert on public.branches for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));
create policy branches_update on public.branches for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'))
  with check (tenant_id = public.auth_tenant_id());
create policy branches_delete on public.branches for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() in ('owner', 'hr_admin'));

-- memberships: everyone reads their own row (even before MFA, so the app knows the role
-- and can send them to MFA setup); owner, HR admin and auditor read the tenant's list;
-- only the owner changes memberships (Step 4 adds the Users screen).
create policy memberships_select_own on public.memberships for select to authenticated
  using (user_id = auth.uid());
create policy memberships_select_tenant on public.memberships for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and public.auth_role() in ('owner', 'hr_admin', 'auditor')
  );
create policy memberships_insert on public.memberships for insert to authenticated
  with check (tenant_id = public.auth_tenant_id() and public.auth_role() = 'owner');
create policy memberships_update on public.memberships for update to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() = 'owner')
  with check (tenant_id = public.auth_tenant_id());
create policy memberships_delete on public.memberships for delete to authenticated
  using (tenant_id = public.auth_tenant_id() and public.auth_role() = 'owner');

-- approvals: the requester, anyone named as an approver on a step, and owner / HR admin /
-- auditor can read. Writes go through create_approval() / act_on_approval().
create or replace function public.is_approver_of(p_approval_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.approval_steps s
    where s.approval_id = p_approval_id
      and s.tenant_id = public.auth_tenant_id()
      and (s.approver_user_id = auth.uid() or s.approver_role = public.auth_role())
  );
$$;

create policy approvals_select on public.approvals for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and (
      requested_by = auth.uid()
      or public.auth_role() in ('owner', 'hr_admin', 'auditor')
      or public.is_approver_of(id)
    )
  );

create policy approval_steps_select on public.approval_steps for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and exists (select 1 from public.approvals a where a.id = approval_id)
  );

revoke insert, update, delete on public.approvals, public.approval_steps from authenticated;

-- notifications: own rows only; the only change allowed is marking them read.
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and tenant_id = public.auth_tenant_id());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid() and tenant_id = public.auth_tenant_id())
  with check (user_id = auth.uid() and tenant_id = public.auth_tenant_id());

revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- audit_log: insert-only via the audit trigger; owner, HR admin and auditor read.
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    tenant_id = public.auth_tenant_id()
    and public.auth_role() in ('owner', 'hr_admin', 'auditor')
  );

revoke insert, update, delete, truncate on public.audit_log from authenticated;
