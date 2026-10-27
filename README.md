# Narcotics Ledger (PharmaFlow)

Pharmacy-focused controlled-substance (narcotics) inventory, dispensing, reconciliation, and compliance ledger.

Built with **Vite + React + TypeScript**, **Supabase** (Auth, Postgres, RLS, RPCs), **TanStack Query**, and **Tailwind CSS**. Deployed on Vercel as `narcoticsledger`.

## Features

- Secure multi-tenant auth with pharmacy profiles and role-based access (user / admin)
- Drug inventory + stock levels
- Prescriptions & dispensing workflow
- Purchase / dispensing / destruction record import (CSV / spreadsheet)
- Reconciliation cycles with McKesson / Kroll file parsing, variance flags, undo/redo, export
- Admin panel (users, trials, subscriptions, audit logs, system health)
- Subscription / trial gating (Stripe-ready)
- Reports, delivery, inspection, and supporting modules

## Tech stack

| Layer        | Choice                                      |
|-------------|---------------------------------------------|
| Frontend    | React 18, TypeScript, Vite                  |
| Styling     | Tailwind CSS, Lucide icons, Framer Motion   |
| Data        | Supabase (Postgres + Auth + Edge Functions) |
| State/async | TanStack React Query                        |
| Routing     | React Router v7                             |
| Deploy      | Vercel                                      |

## Project structure

```
src/
  components/     # Shared UI (Layout, modals, routes guards, paywall)
  context/        # AuthContext
  hooks/          # Domain data hooks (drugs, transactions, reconciliation, admin…)
  lib/            # supabase client, parsers, export, utils
  pages/          # Route-level screens
  types/          # Shared TypeScript types
supabase/
  migrations/     # Canonical schema + RLS + RPCs (source of truth)
  functions/      # Edge functions (webhooks, etc.)
scripts/
  legacy-sql/     # Historical one-off fix scripts (do not run on prod without review)
```

## Setup

1. Clone and install:

```bash
git clone https://github.com/Bot-Maker-Me/pharmaflow.git
cd pharmaflow
npm install
```

2. Environment — copy `.env.example` to `.env` and fill:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=...   # optional until billing is live
```

3. Database — apply migrations from `supabase/migrations/` (via Supabase CLI or SQL editor). Prefer the ordered migration files over anything under `scripts/legacy-sql/`.

4. Run:

```bash
npm run dev
```

## Scripts

- `npm run dev` — local Vite server
- `npm run build` — production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint

## Security notes

- Never commit `.env` or service-role keys. Only the **anon** key belongs in the frontend.
- All data access is intended to go through **RLS policies** and **security-definer RPCs**. Do not bypass with service role from the client.
- Ad-hoc SQL under `scripts/legacy-sql/` is historical; treat as untrusted until reviewed.
- `backup.sql` (if present historically) must never be committed — it can contain PII / controlled-substance data.
- Apply `20261027120000_security_hardening.sql` to prevent profile privilege escalation.

## Architecture principles

1. **Migrations are the source of truth** for schema, RLS, and RPCs.
2. **Thin pages, fat hooks** — data fetching/mutations live in `src/hooks`; pages compose UI.
3. **Shared types** in `src/types` — avoid duplicating interfaces across files.
4. **No debug noise in production** — avoid `console.log` in shipped code; keep `console.error` for real failures.
5. **Access control** — `hasAccess(profile)` + `ProtectedRoute` / `AdminRoute` + DB RLS.

## License

Private / all rights reserved unless otherwise stated.
