/*
# Fix RLS policies to allow all users to see all drugs

This script updates the RLS policies on the drugs table to allow all authenticated
users to SELECT all drugs (so they can check if a DIN exists before creating),
while still restricting INSERT, UPDATE, DELETE to their own drugs.

Run this in your Supabase SQL Editor.
*/

-- Update the SELECT policy to allow all authenticated users to see all drugs
DROP POLICY IF EXISTS "Users can view own drugs" ON drugs;
CREATE POLICY "Users can view all drugs" ON drugs FOR SELECT
  TO authenticated USING (true);

-- Keep other policies restricted to own drugs
DROP POLICY IF EXISTS "Users can insert own drugs" ON drugs;
CREATE POLICY "Users can insert own drugs" ON drugs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own drugs" ON drugs;
CREATE POLICY "Users can update own drugs" ON drugs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own drugs" ON drugs;
CREATE POLICY "Users can delete own drugs" ON drugs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
