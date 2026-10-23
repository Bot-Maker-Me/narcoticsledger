# AI_RULES.md

Project: **Narcotics Ledger** — a pharmacy controlled-substance inventory, dispensing and reconciliation app (React SPA backed by Supabase).

## Tech Stack

- **React 18 + TypeScript + Vite 5** — single-page app, no server layer. All backend work goes through the Supabase client.
- **React Router v7** — **all routes live in `src/App.tsx`** (public routes, `ProtectedRoute` + `Layout` nesting, `AdminRoute`, and the 404 redirect).
- **Supabase (`@supabase/supabase-js` v2)** — auth, Postgres data and RPCs. Use the shared client from `src/lib/supabase.ts`; never create a second client.
- **TanStack React Query v5** — all server state. One hook module per domain in `src/hooks/` exposing `useQuery`/`useMutation` and invalidating its own query key.
- **Tailwind CSS v3** — custom theme in `tailwind.config.js` (`primary` teal, `secondary` blue, `accent`, `success`, `warning`, `error`, `neutral`, Inter font, `shadow-soft|card|elevated`, fade/slide animations).
- **Path alias `@/` → `src/`** (configured in `vite.config.ts`). Use `@/...` imports, not deep relative paths.
- **Auth context** — `src/context/AuthContext.tsx` (`useAuth()`) is the single source of session, user and profile.
- **Environment variables** — only `import.meta.env.VITE_*` (e.g. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never hardcode keys.
- **Errors** — top-level `ErrorBoundary` (`react-error-boundary`) + `ErrorFallback` in `src/App.tsx`.

## Library Rules — use this for that

| Need | Use | Notes |
| --- | --- | --- |
| Routing | `react-router-dom` | Declare routes in `src/App.tsx` only |
| Server data / caching | `@tanstack/react-query` | Wrap Supabase calls in `src/hooks/use*.ts`; key by domain (`['drugs']`, `['transactions']`…) |
| Database + auth | `@supabase/supabase-js` via `@/lib/supabase` | Query with `.select()/insert()/update()`; throw on `error` so React Query surfaces it |
| Session/user state | `useAuth()` from `@/context/AuthContext` | Don't read `supabase.auth` directly in pages |
| Icons | `lucide-react` | No other icon set, no inline SVG icons |
| Toasts | `react-hot-toast` | `toast.success` / `toast.error`; `<Toaster />` is already mounted in `App.tsx` |
| Animation | `framer-motion` | Prefer the Tailwind animation utilities for simple entrances |
| Charts | `recharts` | Used on `Dashboard` / `Reports` |
| CSV / Excel parsing | `papaparse` (CSV) and `xlsx` (XLSX/XLS) | Wrap file parsing in `src/lib/fileParser.ts` |
| CSV export | Build the CSV string in a `src/lib/*export*` helper | See `exportToCSV` in `src/lib/exportUtils.ts` |
| PDF export | `jspdf` | See `exportToPDF` in `src/lib/exportUtils.ts` |
| Date formatting / math | `date-fns` | Don't hand-roll date parsing for display |
| Tooltips | `Tooltip` from `@/components/Tooltip` (wraps `@tippyjs/react`) | Don't import tippy directly — the wrapper handles mount/SSR |
| Error boundaries | `react-error-boundary` | Only at the app root |

Do **not** add a new dependency when an installed library above already covers the need.

## Structure & Naming

- Pages → `src/pages/` (`Index`-style default export, named after the feature: `Inventory.tsx`, `Reconciliation.tsx`).
- Reusable components → `src/components/` (PascalCase file name, default export).
- Data hooks → `src/hooks/` (`useDrugs.ts`, `useTransactions.ts` …).
- Pure helpers/types → `src/lib/` and `src/types/`. Keep components free of business logic.
- When you add a new feature, mount it into the existing routed page in `src/App.tsx` so it is actually reachable.

## Styling Rules

- Tailwind classes for all layout/spacing/colour. Use the custom theme tokens (`bg-primary-600`, `text-neutral-700`, `shadow-card`) instead of raw hex values or arbitrary colours.
- Reuse the shared classes from `src/index.css`: `btn-primary`, `btn-secondary`, `input-field`, `card`.
- Build shadcn-style UI primitives as local components in `src/components/`; keep files small and focused, one concern per file.

## Security & Data Rules

- Controlled-substance data is sensitive: keep every query scoped to the signed-in user; rely on Supabase Row Level Security rather than client-side filtering for access control.
- Never expose service-role keys or secrets in front-end code. Front-end `.env` values must be `VITE_`-prefixed and public-safe (anon key only).
- Validate at the boundary: sanitise/validate user input before inserting, and always handle the `error` returned by Supabase calls.
- Avoid `dangerouslySetInnerHTML`; render user content as text.

## Verification

- Type-check with the project's `typecheck` script before finishing a change.
- Prefer hot reload for source/style edits; only restart the dev server for process-boundary changes (dependency, env or Vite config edits).
