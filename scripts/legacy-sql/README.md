# Legacy SQL scripts (historical — do not run blindly)

These files are **historical one-off fix scripts** that used to live in the repository
root. They are kept only for audit history and are **not** the source of truth.

- The source of truth for the database schema is [`supabase/migrations/`](../../supabase/migrations/).
- Most of these scripts have already been superseded by a migration, a re-created
  RPC/trigger, or a manual run in the Supabase SQL editor.

> ⚠️ Do **not** run these on a production database without reviewing them first.
> Several of them are destructive (drops, re-creates, permission/RLS changes) and are
> written to be idempotent only in the environment they were authored for.

## Naming

| Prefix | Meaning |
| --- | --- |
| `add_*` | Adds columns / statuses that later became migrations |
| `fix_*` | Point fixes for RLS, triggers, RPC signatures, constraints |
| `update_*` | One-off data/RPC updates |
| `apply_all_migrations.sql` | Early "run everything" bootstrap, superseded by `supabase/migrations` |

If a fix here is still required for a fresh environment, it should be promoted into a
new file under `supabase/migrations/` instead of being run from here.
