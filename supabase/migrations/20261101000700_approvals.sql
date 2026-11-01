-- Step 3 (FND-03): generic approval engine. Request → one or more steps → approved / rejected.
-- Later steps (leave, OT, claims, credential verification, payroll release, profile changes)
-- call create_approval() and react to approvals.status changes with their own triggers.

-- Notifies whoever can act on a step: a named user, or every active member with the role.
-- The requester is never asked to approve their own request.
create or replace function public.notify_approval_step(p_approval_id uuid, p_step_no integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals;
  v_step public.approval_steps;
  v_user_id uuid;
begin
  select * into v_approval from public.approvals where id = p_approval_id;
  select * into v_step from public.approval_steps
  where approval_id = p_approval_id and step_no = p_step_no;

  for v_user_id in
    select v_step.approver_user_id where v_step.approver_user_id is not null
    union
    select m.user_id from public.memberships m
    where v_step.approver_role is not null
      and m.tenant_id = v_approval.tenant_id
      and m.role = v_step.approver_role
      and m.is_active
      and m.user_id is not null
  loop
    if v_user_id <> v_approval.requested_by then
      perform public.notify(
        v_user_id,
        'approval_requested',
        jsonb_build_object(
          'approval_id', v_approval.id,
          'entity_type', v_approval.entity_type,
          'entity_id', v_approval.entity_id,
          'step_no', p_step_no
        )
      );
    end if;
  end loop;
end;
$$;

revoke execute on function public.notify_approval_step(uuid, integer) from public, anon, authenticated;

-- p_steps: ordered JSON array, each item {"role": "<app_role>"} or {"user_id": "<uuid>"}.
create or replace function public.create_approval(
  p_entity_type text,
  p_entity_id uuid,
  p_steps jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.auth_tenant_id();
  v_approval_id uuid;
begin
  if v_tenant_id is null then
    raise exception 'No active membership' using errcode = '42501';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'An approval needs at least one step' using errcode = '22023';
  end if;

  insert into public.approvals (tenant_id, entity_type, entity_id, requested_by)
  values (v_tenant_id, p_entity_type, p_entity_id, auth.uid())
  returning id into v_approval_id;

  insert into public.approval_steps (tenant_id, approval_id, step_no, approver_role, approver_user_id)
  select v_tenant_id, v_approval_id, s.ord::integer,
         (s.step ->> 'role')::public.app_role,
         (s.step ->> 'user_id')::uuid
  from jsonb_array_elements(p_steps) with ordinality as s (step, ord);

  perform public.notify_approval_step(v_approval_id, 1);
  return v_approval_id;
end;
$$;

-- Approve or reject the current step. A comment is required to reject.
-- Returns the approval's status afterwards (pending while later steps remain).
create or replace function public.act_on_approval(
  p_approval_id uuid,
  p_decision text,
  p_comment text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.approvals;
  v_step public.approval_steps;
  v_role public.app_role := public.auth_role();
  v_comment text := nullif(btrim(p_comment), '');
  v_has_next boolean;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_comment is null then
    raise exception 'A comment is required to reject' using errcode = '22023';
  end if;

  select * into v_approval from public.approvals
  where id = p_approval_id and tenant_id = public.auth_tenant_id()
  for update;
  if not found then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;
  if v_approval.status <> 'pending' then
    raise exception 'This approval is already %', v_approval.status using errcode = '22023';
  end if;
  if v_approval.requested_by = auth.uid() then
    raise exception 'You cannot approve your own request' using errcode = '42501';
  end if;

  select * into v_step from public.approval_steps
  where approval_id = p_approval_id and step_no = v_approval.current_step;

  -- The owner can act on any step (PRD §4: "Everything").
  -- coalesce: a role step has approver_user_id null, and null comparisons are not false.
  if not coalesce(
    v_step.approver_user_id = auth.uid()
    or v_step.approver_role = v_role
    or v_role = 'owner',
    false
  ) then
    raise exception 'You are not an approver for this step' using errcode = '42501';
  end if;

  update public.approval_steps
  set status = p_decision, comment = v_comment, acted_by = auth.uid(), acted_at = now()
  where id = v_step.id;

  v_has_next := exists (
    select 1 from public.approval_steps
    where approval_id = p_approval_id and step_no = v_step.step_no + 1
  );

  if p_decision = 'approved' and v_has_next then
    update public.approvals set current_step = v_step.step_no + 1 where id = p_approval_id;
    perform public.notify_approval_step(p_approval_id, v_step.step_no + 1);
    return 'pending';
  end if;

  update public.approvals
  set status = p_decision, decided_at = now()
  where id = p_approval_id;

  perform public.notify(
    v_approval.requested_by,
    'approval_decided',
    jsonb_build_object(
      'approval_id', v_approval.id,
      'entity_type', v_approval.entity_type,
      'entity_id', v_approval.entity_id,
      'decision', p_decision,
      'comment', v_comment
    )
  );
  return p_decision;
end;
$$;

revoke execute on function public.create_approval(text, uuid, jsonb) from public, anon;
revoke execute on function public.act_on_approval(uuid, text, text) from public, anon;
grant execute on function public.create_approval(text, uuid, jsonb) to authenticated;
grant execute on function public.act_on_approval(uuid, text, text) to authenticated;
