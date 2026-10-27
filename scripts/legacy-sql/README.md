# Legacy SQL scripts

These files are **historical one-off fixes** used during development. They are **not** the source of truth.

- Prefer `supabase/migrations/` for all schema changes.
- Do **not** run these against production without careful review.
- `backup.sql` (if present) must never be committed — it may contain controlled-substance data.
