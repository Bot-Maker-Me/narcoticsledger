-- ============================================
-- CREATE NEW ADMIN USER TO BYPASS RATE LIMIT
-- Run this in Supabase SQL Editor
-- ============================================

-- Option 1: Create a new admin user with a temporary email
-- You'll need to use the Supabase Dashboard to create the user first:
-- 1. Go to Authentication → Users
-- 2. Click "Add user" or "Create new user"
-- 3. Enter a new email (e.g., admin@pharmastrategies.ca)
-- 4. Set a password
-- 5. After creation, run this SQL to make them admin:

-- UPDATE profiles SET role = 'admin', subscription_status = 'active', trial_ends_at = NULL, trial_end_date = NULL WHERE email = 'admin@pharmastrategies.ca';

-- Option 2: Reset password for existing user (bypasses rate limit)
-- You must do this in Supabase Dashboard:
-- 1. Go to Authentication → Users
-- 2. Find param@pharmastrategies.ca
-- 3. Click on the user
-- 4. Click "Reset Password" button
-- 5. This sends a password reset email that bypasses the login rate limit

-- Option 3: If you have Supabase CLI access, you can reset rate limits
-- This is not possible via SQL - requires Supabase Dashboard or CLI

-- For now, let's prepare the existing user to have admin access once they can log in:
UPDATE profiles
SET
  role = 'admin',
  subscription_status = 'active',
  trial_ends_at = NULL,
  trial_end_date = NULL
WHERE email = 'param@pharmastrategies.ca';

-- Verify
SELECT id, email, role, subscription_status FROM profiles WHERE email = 'param@pharmastrategies.ca';
