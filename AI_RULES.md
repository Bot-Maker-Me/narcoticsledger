# AI_RULES.md

Project: **Narcotics Ledger** — a pharmacy controlled-substance inventory, dispensing and reconciliation app (React SPA backed by Supabase).

## Tech Stack

- **React 18 + TypeScript + Vite 5** — single-page app, no server layer. All backend work goes through the Supabase client.
- **React Router v7** — **all routes live in `src/App.tsx`** (public routes, `ProtectedRoute` + `Layout` nesting, `AdminRoute`, and the 404 redirect).
- **Supabase (`@supabase/supabase-js` v2)** — auth, Postgres data and RPCs. Use the shared client from `src/lib/supabase.ts`; never create a second client.
- **TanStack React Query v5** — all server state. One hook module per domain in `src/hooks/` exposing `useQuery`/`useMutation` and invalidating its own query key.
- **Tailwind CSS v3** — custom theme in `tailwind.config.js` (see Design System below).
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
| Date formatting / math | `date-fns` | Ledger day values go through `src/lib/ledgerDate.ts` |
| Tooltips | `Tooltip` from `@/components/Tooltip` (wraps `@tippyjs/react`) | Don't import tippy directly — the wrapper handles mount/SSR |
| Error boundaries | `react-error-boundary` | Only at the app root |

Do **not** add a new dependency when an installed library above already covers the need.

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

Shared components: `SectionMarker` (`§ 01 · LABEL` with a thin coral rule — used above page/section headings) and `Stamp` (circular coral audit badge).

Rules:
- The ambient backdrop (navy + grid + film grain + coral/indigo corner glows) is painted once on `body` in `src/index.css`. **Never add an opaque page background to a route wrapper** (use `bg-neutral-50`, `bg-surface` or `bg-ink-*` for panels instead) or the backdrop and glass surfaces stop reading.
- Use tokens, not raw hex, in markup. Hex is fine only inside JS (toast options, recharts `fill`/`stroke`).
- Use bracketed opacity for non-standard values (`bg-white/[0.06]`). Tailwind silently drops unrecognised utilities such as `bg-white/6`.
- Recharts: pass explicit colours (`#E85A5A` coral, `#8E9FC4` slate, `#D6A85F` amber, `#7BA88B` sage, `#6B7DA6` blue), tick `fill: '#98A2B8'` and the dark `chartTooltip` style from `Reports.tsx` — recharts' defaults assume a white page.

## Structure & Naming

- Pages → `src/pages/` (`Index`-style default export, named after the feature: `Inventory.tsx`, `Reconciliation.tsx`).
- Reusable components → `src/components/` (PascalCase file name, default export).
- Data hooks → `src/hooks/` (`useDrugs.ts`, `useTransactions.ts` …).
- Pure helpers/types → `src/lib/` and `src/types/`. Keep components free of business logic.
- When you add a new feature, mount it into the existing routed page in `src/App.tsx` so it is actually reachable.
- Page headers follow the pattern `SectionMarker` + serif `<h1 className="mt-4 font-display text-3xl text-neutral-900">` + muted subtitle.

## Styling Rules

- Tailwind classes for all layout/spacing/colour. Use the custom theme tokens (`bg-surface`, `text-neutral-700`, `shadow-card`, `text-primary-500`) instead of raw hex values or arbitrary colours.
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
