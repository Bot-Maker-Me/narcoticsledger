# Database schema

This file describes the schema **actually deployed** on the Supabase project
(`sykgbbkiedlmivwrhufs`). It is documentation, not a migration: the database is the source
of truth, and `supabase/migrations/` under the repo is historical only. Apply changes with
SQL against the project, then update this file.

## Conventions

- Every application table is `public`, has `id uuid primary key default gen_random_uuid()`,
  and (where it holds user data) a `user_id uuid not null references auth.users(id) on
  delete cascade` that defaults to `auth.uid()`.
- RLS is enabled on **every** table. Policies are per-operation and always `to authenticated`.
- `anon` has **no** grants anywhere, and no policies.
- `service_role` has full access to every table; it is used only by edge functions.
- Every `SECURITY DEFINER` function pins `search_path` to `public` and re-checks ownership or
  the admin role in the database. Never trust a client-supplied id.

## Tables

### `profiles`

One row per user, created by the `on_auth_user_created` trigger.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | FK → `auth.users(id)` `on delete cascade` |
| `email` | text | Mirrored from `auth.users` |
| `role` | text | `'user'` \| `'admin'`, default `'user'` |
| `subscription_status` | text | `trialing` \| `active` \| `past_due` \| `cancelled` \| `revoked` \| `none`, default `'trialing'` |
| `trial_ends_at` | timestamptz | Set by the signup trigger from `system_settings.trial_days` |
| `stripe_customer_id` | text | Set by `stripe-checkout` / the webhook |
| `pharmacy_name` | text | Editable by the owner from Settings |
| `created_at` / `updated_at` | timestamptz | `updated_at` is written by the RPCs |

Grants: `SELECT, INSERT, UPDATE` to `authenticated`.
Policies: select/insert/update where `auth.uid() = id`.
Trigger `trg_protect_profile_privileged` blocks a **non-admin** from changing their own
`role`, `subscription_status`, `trial_ends_at` or `stripe_customer_id`.

### `drugs`

The pharmacy's own drug catalogue. **Per user**, unique on `(user_id, din)` — there is no
global DIN uniqueness, precisely so one pharmacy cannot see or claim another's catalogue.

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid | Owner |
| `din` | text | CHECK `^[0-9]{6,10}$` |
| `description` | text | From the file, else the CDSA/DPD reference |
| `schedule` | text | `Narcotic` \| `Controlled` \| `Targeted` \| `Verify` |
| `pack_size` | integer | `> 0`, default 1. Packs → units multiplier |
| `reorder_level` | integer | `>= 0` |

Grants: `SELECT, INSERT, UPDATE, DELETE` to `authenticated` (owner-scoped by RLS).

### `inventory_transactions`

The audit ledger. **Append-only for clients.**

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid | Owner |
| `drug_id` | uuid | FK → `drugs(id)` `on delete set null` |
| `transaction_type` | text | CHECK `PURCHASE` \| `DISPENSE` \| `ADJUSTMENT` (uppercase only) |
| `quantity` | integer | Positive for purchases, negative for dispensations |
| `date` | date | The ledger calendar day (a Postgres `date` — never parse it as UTC) |
| `notes` | text | Manual dispenses record the patient here |
| `source` | text | `purchase_import` \| `dispense_import` \| `destruction_import` \| `manual` \| `prescription` |
| `file_name` | text | The uploaded file, or a ledger label (`Manual entry`, `Prescription`) |
| `voided_at` / `voided_by` | timestamptz / uuid | Set only by `void_imported_records` |

Grants: **`SELECT, INSERT` only** to `authenticated` — no `UPDATE`, no `DELETE`.
Policies: select/insert where `auth.uid() = user_id`. There is deliberately no update or
delete policy, so a client cannot rewrite history. Voiding goes through a `SECURITY DEFINER`
RPC that may only set the two `voided_*` columns.

### `prescriptions`

| Column | Type | Notes |
| --- | --- | --- |
| `patient_name` | text | Required |
| `drug_id` | uuid | FK → `drugs(id)` `on delete set null` |
| `quantity_prescribed` / `quantity_dispensed` | integer | `>= 0` |
| `refills_total` / `refills_remaining` | integer | |
| `status` | text | `active` \| `completed` \| `cancelled` |
| `prescriber`, `notes`, `image_url`, `dispensed_date` | | |

Grants: full CRUD to `authenticated`, owner-scoped by RLS.

### `reconciliation_cycles` / `reconciliation_items`

A cycle is one count event; items are the per-DIN lines.

Item highlights: `opening_balance`, `purchased_count`, `dispensed_count`, `actual_count`
(nullable), `flag` (`OK` \| `Pending count` \| `Review` \| `Verify`), `verify_note`,
`locations` (jsonb), `suggested_adjustment`.
Cycle highlights: `status` (`draft` \| `in_progress` \| `completed`), `checklist` (jsonb),
`performed_by`, `verified_by`, `start_date`, `end_date`.

Grants: full CRUD to `authenticated`, owner-scoped by RLS. Items additionally cascade from
their cycle.

### `system_settings`

Single row (`id = 1`): `subscription_price_cents` (default 2900), `trial_days` (default 14).
`authenticated` has `SELECT` only (policy `read_system_settings`); writes go through
`admin_update_pricing`.

### `audit_logs`

`performed_by`, `action`, `target_user_id`, `details` (jsonb), `created_at`.

**No client access at all** — no grants to `anon`/`authenticated` and no policies. It is
read for the admin UI through `admin_list_audit_logs()` and written by the admin RPCs.

### `stripe_events`

`stripe_event_id` (unique), `event_type`, `processed`, `error`, `created_at`.
Server-only, like `audit_logs`. Gives the Stripe webhook real idempotency and makes failed
deliveries visible on the admin health tab.

## View: `drug_stock_levels`

`security_invoker = true`, so RLS on the underlying tables applies to the caller.

```sql
select d.id, d.user_id, d.din, d.description, d.schedule,
       coalesce(sum(case lower(it.transaction_type)
         when 'purchase'  then abs(it.quantity)
         when 'dispense'  then -abs(it.quantity)
         when 'destruction' then -abs(it.quantity)
         when 'adjustment' then it.quantity
         else 0 end), 0) as current_stock
from drugs d
left join inventory_transactions it
  on d.id = it.drug_id
 and it.user_id = d.user_id      -- never aggregate another tenant's rows
 and it.voided_at is null        -- voided rows stop counting
group by d.id, d.user_id, d.din, d.description, d.schedule;
```

`SELECT` is granted to `authenticated`.

## Functions

All are `SECURITY DEFINER` and pin `search_path` — most to `public`, the ledger cleanup
functions to an empty path with fully-qualified names.

### User-facing

| Function | Purpose |
| --- | --- |
| `get_my_profile()` | Returns the caller's profile row. Does not rely on a table select, so it works before any profile policy is evaluated. |
| `add_purchase(p_drug_id, p_quantity, p_notes)` | Validates ownership and a positive quantity, writes a `PURCHASE` row. |
| `adjust_stock(p_drug_id, p_quantity, p_notes)` | Signed adjustment; **refuses to drive stock negative**. |
| `dispense_drug(p_drug_id, p_quantity, p_patient_name, p_notes)` | Stock-checked dispensation. Writes only a ledger row — it does **not** fabricate a prescription. |
| `dispense_prescription(p_prescription_id, p_quantity)` | Validates ownership, status, remaining quantity and stock, writes the ledger row, and updates the prescription. |
| `void_imported_records(p_transaction_type, p_file_name, p_start, p_end)` | Soft-voids a file's rows (or a date range for pre-file-name records). Returns the number voided. Re-voiding is a no-op. |
| `voided_ledger_summary(p_group_by)` | The caller's **voided** rows grouped by `'month'` (the ledger/transaction date) or `'file'`, with counts, date ranges and the voided timestamp. Feeds the cleanup card on Transaction History. |
| `purge_voided_transactions(p_month, p_file_name, p_all)` | **Physically deletes** the caller's voided rows for exactly one scope (`YYYY-MM`, a file name — `''` for rows with none — or the whole voided set), appends the purge to `audit_logs` and returns the number deleted. |
| `update_reconciliation_opening(...)` / `update_actual_count(...)` | Update a reconciliation item and recompute `flag`. |
| `complete_reconciliation_cycle(...)` | Marks a cycle completed and records who performed/verified it. |

### Admin (all start with `public.is_admin()`)

`is_admin()`, `admin_list_users()`, `admin_extend_trial(user_id, days)`,
`admin_activate_subscription(user_id)`, `admin_cancel_subscription(user_id)`,
`admin_revoke_access(user_id)`, `admin_set_role(user_id, role)`,
`admin_update_pricing(price_cents, trial_days)`, `admin_system_health()`,
`admin_list_audit_logs(limit)`.

Every mutating admin function appends a row to `audit_logs`.

Guards worth keeping when these change:

- `admin_set_role` refuses to change the caller's own role, and refuses to demote the **last**
  remaining admin — otherwise the panel could be left with no administrator. The role CHECK
  still allows only `user` and `admin`; there is no third "super admin" tier.
- `admin_cancel_subscription` is an in-app access change only. It does **not** cancel the
  Stripe subscription, so billing continues until the customer cancels through the billing
  portal or an operator cancels it in the Stripe dashboard.
- Being an admin grants account, plan and audit-log control — **not** access to other
  pharmacies' data. `drugs`, `inventory_transactions`, `prescriptions` and the reconciliation
  tables have no admin read policy, so row level security still scopes them to their owner.

## Invariants worth protecting

1. **`inventory_transactions` is append-only.** Never grant `UPDATE`/`DELETE` back to
   `authenticated`, and never let a void RPC touch any other column. The one deliberate
   exception is `purge_voided_transactions`, which deletes **voided** rows through a
   `SECURITY DEFINER` RPC: keep its `voided_at IS NOT NULL` rail, keep the `audit_logs`
   entry, and never add a delete path that can reach a live row.
2. **`transaction_type` is uppercase and constrained.** All writers (imports, RPCs) must
   match, or inserts fail.
3. **The flag rule lives in two places**: `update_actual_count()` /
   `update_reconciliation_opening()` in SQL, and `computeFlag()` in
   `src/hooks/useReconciliation.ts` (for unsaved drafts). They are pinned to each other by
   `src/lib/__tests__/reconciliationFlag.test.ts` — change both together.
4. **Stock maths never counts voided rows** and never joins across `user_id`.
5. **Pricing is server-side.** `stripe-checkout` reads `system_settings`; no client input
   goes into the amount.
