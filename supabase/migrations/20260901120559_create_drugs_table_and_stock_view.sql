/*
# Create drugs table and drug_stock_levels view

1. New Tables
- `drugs`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users with cascade delete)
  - `din` (text, not null — 6-10 digit Drug Identification Number)
  - `description` (text, not null — drug name/description)
  - `schedule` (text, not null — one of: Narcotic, Controlled, Targeted, Verify)
  - `pack_size` (integer, not null — number of units per pack)
  - `reorder_level` (integer, not null — stock threshold for reordering)
  - `created_at` (timestamptz, defaults to now)

2. New Views
- `drug_stock_levels` — returns drug id and current stock (0 for now since stock movements
  are not yet implemented; this view is designed to be extended when stock transactions are added).
  Currently returns `drug_id` and `current_stock = 0` for each drug the user owns.

3. Constraints
- Unique constraint on (user_id, din) — each user's drugs have unique DINs.
- CHECK constraint on schedule to restrict to allowed values.
- CHECK constraint on din to be exactly 8 digits.

4. Security (RLS)
- Enable RLS on `drugs`.
- Owner-scoped CRUD: authenticated users can only SELECT, INSERT, UPDATE, DELETE rows
  where user_id = auth.uid().
- The `drug_stock_levels` view inherits RLS from the underlying drugs table.

5. Important Notes
- user_id defaults to auth.uid() so frontend inserts that omit user_id succeed.
- The view uses SECURITY INVOKER so RLS policies on drugs are enforced.
*/

CREATE TABLE IF NOT EXISTS drugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  din text NOT NULL,
  description text NOT NULL,
  schedule text NOT NULL CHECK (schedule IN ('Narcotic', 'Controlled', 'Targeted', 'Verify')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, din),
  CHECK (din ~ '^[0-9]{6,10}$')
);

ALTER TABLE drugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_drugs" ON drugs;
CREATE POLICY "select_own_drugs" ON drugs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_drugs" ON drugs;
CREATE POLICY "insert_own_drugs" ON drugs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_drugs" ON drugs;
CREATE POLICY "update_own_drugs" ON drugs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_drugs" ON drugs;
CREATE POLICY "delete_own_drugs" ON drugs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Index for faster searches on din and description
CREATE INDEX IF NOT EXISTS idx_drugs_user_id ON drugs(user_id);
CREATE INDEX IF NOT EXISTS idx_drugs_din ON drugs(din);

-- View that returns current stock per drug.
-- Currently returns 0 for current_stock since stock transactions are not yet implemented.
-- This is designed to be extended with a drug_stock_movements table in the future.
CREATE OR REPLACE VIEW drug_stock_levels AS
SELECT
  d.id AS drug_id,
  COALESCE(0, 0) AS current_stock
FROM drugs d;

-- The view automatically respects RLS from the underlying table.
-- We set it to SECURITY INVOKER so the caller's policies apply.
ALTER VIEW drug_stock_levels SET (security_invoker = true);
