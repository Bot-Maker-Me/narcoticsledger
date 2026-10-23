/*
# Fix global DIN uniqueness and RLS policies for multi-user drug sharing

This migration fixes the issue where users cannot upload files if drugs were 
created by another user. The changes:

1. Change unique constraint from (user_id, din) to just (din) for global uniqueness
2. Modify RLS policies so users can see all drugs (for DIN checking) but only modify their own
3. This allows multiple users to import the same drugs without conflicts

This ensures that when one user creates a drug, other users can reference it
when importing files, preventing duplicate key errors.
*/

-- First, drop the existing unique constraint on (user_id, din)
ALTER TABLE drugs DROP CONSTRAINT IF EXISTS drugs_user_id_din_key;

-- Add a global unique constraint on just din
ALTER TABLE drugs ADD CONSTRAINT drugs_din_key UNIQUE (din);

-- Update RLS policies to allow all authenticated users to SELECT all drugs
-- (so they can check if a DIN exists before creating)
DROP POLICY IF EXISTS "select_own_drugs" ON drugs;
CREATE POLICY "select_all_drugs" ON drugs FOR SELECT
  TO authenticated USING (true);

-- Keep INSERT restricted to own drugs (user_id will default to auth.uid())
DROP POLICY IF EXISTS "insert_own_drugs" ON drugs;
CREATE POLICY "insert_own_drugs" ON drugs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Keep UPDATE restricted to own drugs
DROP POLICY IF EXISTS "update_own_drugs" ON drugs;
CREATE POLICY "update_own_drugs" ON drugs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Keep DELETE restricted to own drugs
DROP POLICY IF EXISTS "delete_own_drugs" ON drugs;
CREATE POLICY "delete_own_drugs" ON drugs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Note: This change means that if there are currently duplicate DINs across different users,
-- this migration will fail. In that case, you'll need to manually resolve duplicates first.
