-- Security hardening, phase 1 (additive: safe to apply BEFORE the new frontend is deployed).
--
--   1. Signed-out visitors can no longer call any database function over the REST API.
--   2. handle_new_user() read a column that does not exist (NEW.user_metadata), so its
--      EXCEPTION handler swallowed the error and every signup was left without a profile.
--   3. Signed-in users may only update their own `pharmacy_name`. Role, subscription,
--      trial, Stripe id and e-mail are changed by server-side functions only.
--   4. RLS policies evaluate auth.uid() once per query instead of once per row.
--   5. Covering indexes for the foreign keys and the hot ledger queries.
--   6. The stock view is read-only for API roles.

-- ---------------------------------------------------------------------------
-- 1. Function privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from PUBLIC, anon;
alter default privileges for role postgres in schema public revoke execute on functions from PUBLIC, anon;

-- Trigger-only functions have no business being callable through the API at all.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.protect_profile_privileged_columns() from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Signup trigger: read the metadata from the real column
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_trial_days integer;
  v_pharmacy_name text;
begin
  select trial_days into v_trial_days from system_settings where id = 1;
  if v_trial_days is null then
    v_trial_days := 14;
  end if;

  v_pharmacy_name := nullif(btrim(new.raw_user_meta_data ->> 'pharmacy_name'), '');
  if v_pharmacy_name is null then
    v_pharmacy_name := 'My Pharmacy';
  end if;

  insert into profiles (id, email, role, subscription_status, trial_ends_at, pharmacy_name)
  values (
    new.id,
    new.email,
    'user',
    'trialing',
    now() + (v_trial_days || ' days')::interval,
    left(v_pharmacy_name, 200)
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- Never block a signup; ensure_my_profile() repairs the row on first login.
    raise warning 'Failed to create profile for user %: %', new.id, sqlerrm;
    return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. profiles: column-level UPDATE (the privilege trigger stays as a second lock)
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated, anon;
grant update (pharmacy_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS: (select auth.uid()) is planned once per query, not evaluated per row
-- ---------------------------------------------------------------------------
alter policy "Users can view own drugs"   on public.drugs using ((select auth.uid()) = user_id);
alter policy "Users can insert own drugs" on public.drugs with check ((select auth.uid()) = user_id);
alter policy "Users can update own drugs" on public.drugs using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can delete own drugs" on public.drugs using ((select auth.uid()) = user_id);

alter policy "Users can view own transactions"   on public.inventory_transactions using ((select auth.uid()) = user_id);
alter policy "Users can insert own transactions" on public.inventory_transactions with check ((select auth.uid()) = user_id);

alter policy "Users can view own prescriptions"   on public.prescriptions using ((select auth.uid()) = user_id);
alter policy "Users can insert own prescriptions" on public.prescriptions with check ((select auth.uid()) = user_id);
alter policy "Users can update own prescriptions" on public.prescriptions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can delete own prescriptions" on public.prescriptions using ((select auth.uid()) = user_id);

alter policy "Users can view own cycles"   on public.reconciliation_cycles using ((select auth.uid()) = user_id);
alter policy "Users can insert own cycles" on public.reconciliation_cycles with check ((select auth.uid()) = user_id);
alter policy "Users can update own cycles" on public.reconciliation_cycles using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can delete own cycles" on public.reconciliation_cycles using ((select auth.uid()) = user_id);

alter policy "Users can view own recon items"   on public.reconciliation_items using ((select auth.uid()) = user_id);
alter policy "Users can insert own recon items" on public.reconciliation_items with check ((select auth.uid()) = user_id);
alter policy "Users can update own recon items" on public.reconciliation_items using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can delete own recon items" on public.reconciliation_items using ((select auth.uid()) = user_id);

alter policy "Users can view own profile" on public.profiles using ((select auth.uid()) = id);
alter policy "update_own_profile"         on public.profiles using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------
-- Stock view: SUM per drug over non-voided rows.
create index if not exists idx_it_drug_user_active
  on public.inventory_transactions (drug_id, user_id) where voided_at is null;
-- Record browsers: one user, one transaction type, newest first.
create index if not exists idx_it_user_type_created
  on public.inventory_transactions (user_id, transaction_type, created_at desc) where voided_at is null;
create index if not exists idx_it_voided_by on public.inventory_transactions (voided_by) where voided_by is not null;

create index if not exists idx_prescriptions_user on public.prescriptions (user_id);
create index if not exists idx_prescriptions_drug on public.prescriptions (drug_id);
create index if not exists idx_recon_cycles_user_created on public.reconciliation_cycles (user_id, created_at desc);
create index if not exists idx_recon_items_cycle on public.reconciliation_items (cycle_id);
create index if not exists idx_recon_items_user on public.reconciliation_items (user_id);
create index if not exists idx_recon_items_drug on public.reconciliation_items (drug_id);
create index if not exists idx_audit_logs_performed_by on public.audit_logs (performed_by);
create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Stock view: SELECT only
-- ---------------------------------------------------------------------------
revoke all on public.drug_stock_levels from anon, authenticated;
grant select on public.drug_stock_levels to authenticated;
