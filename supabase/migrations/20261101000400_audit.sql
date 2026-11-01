-- Step 3 (FND-04): generic audit trigger. Every 🔒 table in data-model.md gets it:
--   select audit.enable('public.<table>');
-- in the migration that creates the table (now and in every later step).

create schema if not exists audit;
revoke all on schema audit from public, anon, authenticated;

create or replace function audit.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  insert into public.audit_log (tenant_id, table_name, row_id, action, old_data, new_data, actor_id)
  values (
    case when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid
         else (v_row ->> 'tenant_id')::uuid end,
    tg_table_schema || '.' || tg_table_name,
    (v_row ->> 'id')::uuid,
    tg_op,
    v_old,
    v_new,
    auth.uid()
  );
  return null; -- AFTER trigger: return value is ignored
end;
$$;

-- Attaches the audit trigger to a table (idempotent).
create or replace function audit.enable(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('drop trigger if exists audit_log_changes on %s', p_table);
  execute format(
    'create trigger audit_log_changes after insert or update or delete on %s
       for each row execute function audit.log_change()',
    p_table
  );
end;
$$;

revoke execute on function audit.enable(regclass) from public, anon, authenticated;

-- 🔒 tables created in Step 3 (data-model.md §3.1).
select audit.enable('public.memberships');
