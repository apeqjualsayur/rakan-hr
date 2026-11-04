-- Step 10 fix: a column-level revoke does not narrow a table-level grant, so roster
-- builders could still set published_at directly. Grant updatable columns explicitly;
-- publishing goes only through publish_roster().
revoke update on public.roster_shifts from authenticated;
grant update (branch_id, employee_id, shift_date, start_time, end_time, break_minutes,
  room_or_service, is_on_call, notes) on public.roster_shifts to authenticated;
revoke insert on public.roster_shifts from authenticated;
grant insert (branch_id, employee_id, shift_date, start_time, end_time, break_minutes,
  room_or_service, is_on_call, notes) on public.roster_shifts to authenticated;
