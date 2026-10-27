# AI_RULES.md

Project: **Narcotics Ledger** — a pharmacy controlled-substance inventory, dispensing and
reconciliation app (React SPA backed by Supabase).

## Tech Stack

- **React 18 + TypeScript + Vite 5** — single-page app, no server layer. All backend work goes through the Supabase client.
- **React Router v7** — **all routes live in `src/App.tsx`** (public routes, `ProtectedRoute` + `Layout` nesting, `AdminRoute`, and the 404 redirect).
- **Supabase (`@supabase/supabase-js` v2)** — auth, Postgres data and RPCs. Use the shared client from `src/lib/supabase.ts`; never create a second client.
- **TanStack React Query v5** — all server state. One hook module per domain in `src/hooks/` exposing `useQuery`/`useMutation` and invalidating its own query key.
- **Tailwind CSS v3** — custom theme in `tailwind.config.js` (see Design System below).
- **Path alias `@/` → `src/`** (configured in `vite.config.ts`). Use `@/...` imports, not deep relative paths.
- **Auth context** — `src/context/AuthContext.tsx` (`useAuth()`) is the single source of session, user, profile and auth actions.
- **Environment variables** — only `import.meta.env.VITE_*` (e.g. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Never hardcode keys.
- **Errors** — top-level `ErrorBoundary` (`react-error-boundary`) + `ErrorFallback` in `src/App.tsx`, plus `ConfirmProvider` for confirmations and `getErrorMessage`/`reportError` from `@/lib/errors` for everything else.

## Structure — where does this file go?

| Kind of code | Home |
| --- | --- |
| Route component | `src/pages/` (thin: orchestration + layout, no data fetching) |
| Generic, domain-free UI | `src/components/ui/` (`ConfirmDialog`, `DropZone`, `EmptyState`) |
| Domain components | `src/components/<domain>/` (`records/`, `admin/`, `reconciliation/`) |
| Server state / data hooks | `src/hooks/` (`useDrugs.ts`, `useTransactions.ts`, `useFileList.ts` …) |
| Pure logic & helpers | `src/lib/` — one concern per file |
| Types only | `src/types/` — **no runtime code in a types file** |
| Schema documentation | `docs/database-schema.md` |

Canonical helpers — **never re-implement these**:

| Concern | Import from |
| --- | --- |
| DIN parsing, padding, comparison | `@/lib/din` (`digitsOf`, `normalizeDin`, `padDin`, `isSameDin`, `looksLikeDin`, `isValidDin`) |
| Display formatting for dates | `@/lib/dates` (`formatDate`, `formatDateTime`, `formatLongDate`, `formatDayMonth`, `formatMonthYear`, `formatWeekdayLong`) |
| Money / numbers / bytes | `@/lib/format` (`formatPrice`, `formatNumber`, `formatBytes`) |
| Subscription / trial gating | `@/lib/access` (`hasAccess`) |
| Ledger calendar days (timezone-safe) | `@/lib/ledgerDate` |
| Error messages & reporting | `@/lib/errors` (`getErrorMessage`, `reportError`) |
| Supplier file parsing | `@/lib/fileParser` |
| CDSA/DPD reference lookups | `@/lib/dinReference` |
| CSV / PDF export | `@/lib/exportUtils` |
| Report rows, columns & date window | `@/lib/reports` (`reportRows`, `reportHeaders`, `reportRecordCount`, `scheduleSlices`, `rangeStart`, `withinRange`) |

Per-record-kind copy and behaviour (title, icon, parser profile, quantity label, filters)
lives in one place: `src/components/records/config.ts` (`RECORD_KINDS`). Add a new record
kind there, not in a page.

## Library Rules — use this for that

| Need | Use | Notes |
| --- | --- | --- |
| Routing | `react-router-dom` | Declare routes in `src/App.tsx` only |
| Server data / caching | `@tanstack/react-query` | Wrap Supabase calls in `src/hooks/use*.ts`; key by domain (`['drugs']`, `['transactions']`…) |
| Database + auth | `@supabase/supabase-js` via `@/lib/supabase` | Query with `.select()/insert()/update()`; throw on `error` so React Query surfaces it |
| Privileged writes | `supabase.rpc(...)` | See the Database Rules below |
| Session/user state | `useAuth()` from `@/context/AuthContext` | Don't read `supabase.auth` directly in pages |
| Confirmation dialogs | `useConfirm()` from `@/components/ui/ConfirmDialog` | **Never use `window.confirm`** — it ignores the design system |
| File drop zones | `DropZone` from `@/components/ui/DropZone` | The only drop zone; don't hand-roll another |
| Drag/drop file state | `useFileList()` from `@/hooks/useFileList` | Shared add/remove/clear + extension validation |
| Removing an imported file | `useDeleteImportedFile()` from `@/hooks/useDeleteImportedFile` | Confirm + toast + void mutation in one call |
| Empty / zero-result panels | `EmptyState` from `@/components/ui/EmptyState` | |
| Icons | `lucide-react` | No other icon set, no inline SVG icons |
| Toasts | `react-hot-toast` | `toast.success` / `toast.error`; `<Toaster />` is already mounted in `App.tsx` |
| Animation | `framer-motion` | Prefer the Tailwind animation utilities for simple entrances |
| Charts | `recharts` | Used on `Dashboard` / `Reports`; pass explicit colours (see below) |
| CSV / Excel parsing | `papaparse` (CSV) and `xlsx` (XLSX/XLS) | Wrap file parsing in `src/lib/fileParser.ts` |
| CSV export | Build the CSV string in `src/lib/exportUtils.ts` | |
| PDF export | `jspdf` | See `exportToPDF` in `src/lib/exportUtils.ts` |
| Date formatting / math | `@/lib/dates` + `@/lib/ledgerDate` | No `date-fns`; the ledger helpers handle the calendar-day problem |
| Tooltips | `Tooltip` from `@/components/Tooltip` (wraps `@tippyjs/react`) | Don't import tippy directly |
| Error boundaries | `react-error-boundary` | Root boundary + `Layout`'s boundary only |

Do **not** add a new dependency when an installed library above already covers the need.
Load heavy, rarely-used libraries (`xlsx`, `jspdf`, `recharts`) with a dynamic `import()`
or `React.lazy` — never at module top level in an eagerly-loaded file.

## Database Rules

The **live database is the source of truth**, not `supabase/migrations/` (those files are
generated externally and have drifted). Apply schema changes with SQL against the project
and keep [`docs/database-schema.md`](./docs/database-schema.md) in step. Never hand-write
new files into `supabase/migrations/`.

- **The ledger is append-only.** `inventory_transactions` grants only `SELECT` and `INSERT`
  to `authenticated`; there is no update or delete policy. Removing an imported file
  **voids** its rows via `void_imported_records()`, which may only set `voided_at`/`voided_by`.
  Voided rows are hidden from `drug_stock_levels` and the record browsers, and shown with a
  "Voided" badge in Transaction History. Never delete a ledger row.
- **Per-user drug catalogue.** `drugs` is unique on `(user_id, din)` and readable only by
  its owner. Imports create the caller's own row; never add global DIN uniqueness or a
  `USING (true)` read policy.
- **`transaction_type` is uppercase**: `PURCHASE` | `DISPENSE` | `ADJUSTMENT`, enforced by a
  CHECK constraint. Read and write it with one casing (`.eq('transaction_type', type)`).
- **Privileged writes are `SECURITY DEFINER` RPCs** that re-check ownership or
  `public.is_admin()` inside Postgres. Client-supplied ids are never trusted. All admin
  mutations append to `audit_logs`.
- **Billing is server-authoritative.** `stripe-checkout` reads the price from
  `system_settings`; the browser never sends an amount. `stripe-portal` opens the billing
  portal for cancellations.
- **`audit_logs` and `stripe_events` are server-only**: no grants, no policies, reachable
  only through `service_role` or an admin RPC.
- **Errors surface.** Never swallow a Supabase error with a silent fallback — that is how a
  completely broken admin panel went unnoticed.

## Design System — "Employee Portal" dark theme

A calm, audit-ready dark healthcare look: deep navy, a single soft-coral accent, warm cream product cards and serif headlines.

**The colour scales are deliberately inverted.** In `tailwind.config.js`, the `neutral`, `primary`, `secondary`, `success`, `warning`, `error` and `accent` scales run dark → light, so the low steps are *surfaces* and the high steps are *text*. That is why `text-neutral-900` (near-white) on `bg-neutral-50` (dark navy) is correct, and why `bg-success-50 text-success-700` renders as a dark sage chip with light sage text. **Do not "fix" these values to the stock Tailwind palette.**

| Token | Meaning |
| --- | --- |
| `ink-950…600` | Page and app-shell navy backgrounds, overlays |
| `surface` | Dark panel/dropdown background |
| `cream-50…500` | Warm off-white, only for product/marketing cards |
| `primary-*` | Soft coral `#E85A5A` — the only accent (buttons, markers, emphasis, destructive states) |
| `font-display` | Serif stack for headlines and brand names |
| `font-sans` | Inter, for all UI text |

Shared classes in `src/index.css`: `card` (dark glass), `card-cream` (mockups), `btn-primary` (coral, hover lift + glow), `btn-secondary` (ghost outline), `input-field` (cream field with coral focus ring), `field-label` (small uppercase tracked label).

Shared components: `SectionMarker` (`§ 01 · LABEL` with a thin coral rule — used above page/section headings; the `index` prop is optional) and `Stamp` (circular coral audit badge).

Rules:
- The ambient backdrop (navy + grid + film grain + coral/indigo corner glows) is painted once on `body` in `src/index.css`. **Never add an opaque page background to a route wrapper** (use `bg-neutral-50`, `bg-surface` or `bg-ink-*` for panels instead) or the backdrop and glass surfaces stop reading.
- Use tokens, not raw hex, in markup. Hex is fine only inside JS (toast options, recharts `fill`/`stroke`).
- Use bracketed opacity for non-standard values (`bg-white/[0.06]`). Tailwind silently drops unrecognised utilities such as `bg-white/6`.
- Recharts: pass explicit colours (`#E85A5A` coral, `#8E9FC4` slate, `#D6A85F` amber, `#7BA88B` sage, `#6B7DA6` blue), tick `fill: '#98A2B8'` and the dark `chartTooltip` style from `Reports.tsx` — recharts' defaults assume a white page.

## Styling Rules

- Tailwind classes for all layout/spacing/colour. Use the custom theme tokens (`bg-surface`, `text-neutral-700`, `shadow-card`, `text-primary-500`) instead of raw hex values or arbitrary colours.
- Reuse the shared classes from `src/index.css`: `btn-primary`, `btn-secondary`, `input-field`, `card`.
- Build shadcn-style UI primitives as local components in `src/components/ui/`; keep files small and focused, one concern per file.
- Page headers follow the pattern `SectionMarker` + serif `<h1 className="mt-4 font-display text-3xl text-neutral-900">` + muted subtitle.

## Auth Routes

`/reset-password` and `/auth/callback` are **public** routes and must stay outside
`PublicRoute` — a recovery or confirmation link signs the user in first, and `PublicRoute`
would bounce them to the dashboard before they can set a password. Password recovery is
started with `resetPassword()` from `useAuth()` (which supplies the absolute `redirectTo`).

## Security & Data Rules

- Controlled-substance data is sensitive: keep every query scoped to the signed-in user; rely on Supabase Row Level Security rather than client-side filtering for access control.
- Never expose service-role keys or secrets in front-end code. Front-end `.env` values must be `VITE_`-prefixed and public-safe (anon key only).
- Validate at the boundary: sanitise/validate user input before inserting (including values interpolated into PostgREST `or=(…)` filters), and always handle the `error` returned by Supabase calls.
- Avoid `dangerouslySetInnerHTML`; render user content as text.
- Never commit database dumps or `.env` files (see `.gitignore`).

## Verification

- Type-check with `npm run typecheck` and lint with `npm run lint` before finishing a change.
- Keep the audit-relevant pure logic covered by tests (`npm run test`); `src/lib/__tests__/` holds them. Examples: DIN helpers, ledger calendar days, the access gate, and `computeFlag` — which is pinned to the database's flag rules and must be changed alongside them.
- Prefer hot reload for source/style edits; only restart the dev server for process-boundary changes (dependency, env or Vite config edits).
