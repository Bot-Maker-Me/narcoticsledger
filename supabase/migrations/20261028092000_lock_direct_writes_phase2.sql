-- Security hardening, phase 2: close the direct-write paths.
--
-- APPLY ONLY AFTER the frontend that uses the RPCs from 20261028091000_ledger_rpcs.sql
-- is deployed. The previous frontend inserts into these tables directly and would stop
-- working the moment this runs.
--
-- After this migration the ONLY way to change the ledger or a reconciliation is through an
-- audited SECURITY DEFINER function:
--   inventory_transactions  -> add_purchase, adjust_stock, dispense_drug, dispense_prescription,
--                              import_ledger_rows, void_imported_records
--   reconciliation_cycles   -> save_reconciliation_draft, save_reconciliation_cycle,
--                              complete_reconciliation_cycle, delete_reconciliation_cycle
--   reconciliation_items    -> save_reconciliation_draft, save_reconciliation_cycle,
--                              update_actual_count, update_reconciliation_opening
-- (SELECT is unchanged, so every screen keeps reading exactly what it read before.)

revoke insert on public.inventory_transactions from authenticated;
revoke insert, update, delete on public.reconciliation_cycles from authenticated;
revoke insert, update, delete on public.reconciliation_items from authenticated;

-- The matching write policies are now unreachable; drop them so the intent is explicit.
drop policy if exists "Users can insert own transactions" on public.inventory_transactions;

drop policy if exists "Users can insert own cycles" on public.reconciliation_cycles;
drop policy if exists "Users can update own cycles" on public.reconciliation_cycles;
drop policy if exists "Users can delete own cycles" on public.reconciliation_cycles;

drop policy if exists "Users can insert own recon items" on public.reconciliation_items;
drop policy if exists "Users can update own recon items" on public.reconciliation_items;
drop policy if exists "Users can delete own recon items" on public.reconciliation_items;
