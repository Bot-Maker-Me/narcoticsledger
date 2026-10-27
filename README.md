# Narcotics Ledger

A pharmacy **controlled-substance inventory, dispensing and reconciliation** app.
Pharmacists upload supplier exports (McKesson purchases, Kroll dispensations), reconcile
expected vs. actual counts, and keep an audit-ready ledger of every transaction.

> ⚠️ This app handles controlled-substance data. Treat every change as audit-relevant:
> keep queries scoped to the signed-in user, rely on Row Level Security (RLS), and never
> commit real data dumps to the repository.

## Stack

| Area | Choice |
| --- | --- |
| UI | React 18 + TypeScript + Vite 5 (single-page app, no server layer) |
| Routing | React Router v7 — all routes declared in `src/App.tsx` |
| Server state | TanStack React Query v5 |
| Backend | Supabase (Postgres, Auth, RPCs, Edge Functions) |
| Styling | Tailwind CSS v3 (custom dark theme) |
| Charts | Recharts (lazy-loaded with the Reports route) |
| Files | PapaParse (CSV) + SheetJS (XLSX/XLS, loaded on demand) |
| Export | `jspdf` (PDF, loaded on demand) + CSV helpers in `src/lib/exportUtils.ts` |
| Icons / toasts / motion | `lucide-react`, `react-hot-toast`, `framer-motion` |

For the full library and design-system rules, see [`AI_RULES.md`](./AI_RULES.md).
For the database, see [`docs/database-schema.md`](./docs/database-schema.md).

## Getting started

```bash
npm install
cp .env.example .env      # then fill in the two values below
npm run dev
```

Required environment variables (front-end only, `VITE_`-prefixed and public-safe):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Only the **anon** key belongs in the browser. Never put a service-role key in `.env`
or anywhere under `src/`.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |

### Edge function secrets

Set these in the Supabase dashboard under **Edge Functions → Manage Secrets**. They are
server-side only and never reach the browser:

| Secret | Used by | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | `stripe-checkout`, `stripe-portal`, `stripe-webhook` | Server key. |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Verifies the signature. |
| `APP_URL` | all `stripe-*` functions | Absolute app URL used for redirects, e.g. `https://app.example.com`. When unset the request origin is used. |
| `ALLOWED_ORIGINS` | all functions | Optional comma-separated CORS allowlist. Unset echoes the requesting origin. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided
automatically.

## Project structure

```
src/
  App.tsx                 # All routes (public, protected, admin, 404)
  main.tsx                # React root + QueryClient provider
  context/AuthContext.tsx # Session + profile + auth actions (useAuth)
  components/
    ui/                   # Generic primitives (ConfirmDialog, DropZone, EmptyState)
    records/              # The record domain (browser, upload pieces, per-kind config)
    admin/                # Admin dashboard tabs
    reconciliation/       # Reconciliation views (landing, table, detail, history)
  hooks/                  # One React Query module per domain (useDrugs, useAdmin, ...)
  lib/                    # Pure helpers, one concern per file:
                          #   din.ts        DIN parsing/comparison (single source of truth)
                          #   dates.ts      date/number display formatting
                          #   format.ts     money and byte formatting
                          #   access.ts     subscription/trial gating
                          #   ledgerDate.ts calendar-day parsing (timezone-safe)
                          #   errors.ts     error messages + reporting
                          #   reports.ts    report rows, columns and date window
                          #   fileParser.ts supplier export parsing
                          #   dinReference.ts  CDSA/DPD lookup service
                          #   exportUtils.ts   CSV/PDF export
                          #   stockLevels.ts   shared stock query
                          #   supabase.ts      the single Supabase client
  pages/                  # Routed pages (thin wrappers around feature components)
  types/                  # Domain types only — no runtime code
docs/database-schema.md   # The real schema, table by table
supabase/
  migrations/             # HISTORICAL — see "Database schema" below
  functions/              # din-reference, stripe-checkout, stripe-webhook, stripe-portal
scripts/legacy-sql/       # HISTORICAL one-off SQL — not run automatically
```

### Architecture principles

- **One hook module per domain.** Server state lives in `src/hooks/use*.ts`; each hook owns
  its query key and invalidates it on mutation. Components stay free of business logic.
- **Pages orchestrate, components render.** Large pages are decomposed into focused
  components (e.g. `src/components/reconciliation/`, `src/components/admin/`) so state and
  UI stay separate and each file has one concern.
- **Routes only in `src/App.tsx`.** Add a page, then mount it there so it is reachable.
- **One primitive, one home.** DIN handling lives in `@/lib/din`, date formatting in
  `@/lib/dates`, money in `@/lib/format`. Nothing re-implements padding or formatting.
- **Use the shared building blocks**: `@/lib/supabase` for the client, `useAuth()` for
  session, `@/components/ui/ConfirmDialog` (`useConfirm()`) instead of `window.confirm`,
  `@/components/ui/DropZone` for uploads, and `card` / `btn-primary` / `input-field` for
  consistent styling.
- **Heavy dependencies load on demand.** `xlsx`, `jspdf` and `recharts` are dynamically
  imported so they stay out of the initial bundle — keep it that way.

## Data, auth & security

- **RLS everywhere.** Every table has Row Level Security enabled with per-operation
  policies scoped to `auth.uid()`. Access control is enforced in the database, not in the
  client. Grant API access (to `authenticated`, and `service_role` for trusted server code)
  separately from RLS — they are two layers.
- **Drug rows are per-pharmacy.** `drugs` is unique on `(user_id, din)` and readable only by
  its owner, so one pharmacy's catalogue is invisible to another. Imports create the
  caller's own row rather than sharing one.
- **The ledger is append-only.** `authenticated` has only `SELECT` and `INSERT` on
  `inventory_transactions`. Removing an imported file **voids** its rows
  (`void_imported_records`, which sets `voided_at`/`voided_by`) instead of deleting them, so
  the audit trail always survives. Voided rows are excluded from stock maths and the record
  browsers but stay visible in Transaction History.
- **Privileged work goes through `SECURITY DEFINER` RPCs.** Dispensing, stock adjustments,
  voiding and every admin action re-check ownership or the admin role inside Postgres
  (`public.is_admin()`), never from client-supplied identity.
- **Auth.** Supabase Auth with a signup trigger that creates a `profiles` row. Route guards
  (`ProtectedRoute`, `AdminRoute`) plus `hasAccess` handle the paywall/trial gate.
  Password recovery and email confirmation come back through `/reset-password` and
  `/auth/callback`, which are deliberately public routes.
- **Billing is server-authoritative.** The price always comes from `system_settings` on the
  server; the browser never sends an amount. The webhook verifies the Stripe signature in
  constant time, is idempotent via `stripe_events`, and binds the payer with
  `client_reference_id`. Subscriptions are cancelled through the Stripe billing portal.
- **Edge functions.** `din-reference` resolves CDSA/DPD product names and schedules
  server-side so reference data is never shipped to the browser. Edge functions run with
  `verify_jwt: false`, so every function verifies the caller's JWT itself and keeps the
  service-role key server-side only.
- **Validation at the boundary.** Validate/sanitise user input (including imported files)
  before inserting, and always handle the `error` returned by Supabase calls. Nothing
  swallows a failure silently — see `src/lib/errors.ts`.

## Database schema

**The live database is the source of truth, not `supabase/migrations/`.** Those migration
files are generated by an external tool and had drifted far from the deployed project
(missing tables, columns that never existed, and objects that were never applied), so they
are kept only as history. [`docs/database-schema.md`](./docs/database-schema.md) describes
what is actually deployed, table by table and function by function.

**Apply schema changes with SQL against the project** (Supabase SQL editor, or the SQL tool
in your editor). Do not hand-write new files into `supabase/migrations/`, and do not add
scripts to `scripts/legacy-sql/` — see
[`scripts/legacy-sql/README.md`](./scripts/legacy-sql/README.md).

When you change the schema, update `docs/database-schema.md` in the same change.

### Never commit

`.gitignore` blocks database dumps (`*.dump`, `*.sql.gz`, `backup.sql`, …), `.env` files
and Supabase temp material. Dumps can contain real controlled-substance and patient data —
keep them out of version control entirely.

## Design system

The app uses a dark "employee portal" theme: deep-navy surfaces, a single soft-coral
accent, warm cream product cards and serif headlines. Colour scales are deliberately
inverted (low steps = surfaces, high steps = text). See the **Design System** section of
[`AI_RULES.md`](./AI_RULES.md) before adding UI.
