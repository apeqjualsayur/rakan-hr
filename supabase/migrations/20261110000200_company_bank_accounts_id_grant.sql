-- Step 12: the app chooses the id of a new company bank account (so it can show it straight
-- away), as it does for claims. RLS still limits inserts to the Owner.
grant insert (id) on public.company_bank_accounts to authenticated;
