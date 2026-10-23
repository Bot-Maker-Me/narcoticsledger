-- ============================================
-- FIX RATE LIMIT ISSUE FOR USER
-- Run this in Supabase SQL Editor
-- ============================================

-- Check if the user exists in auth.users
SELECT id, email, created_at, last_sign_in_at FROM auth.users WHERE email = 'param@pharmastrategies.ca';

-- Check profile data
SELECT id, email, role, subscription_status, trial_ends_at FROM profiles WHERE email = 'param@pharmastrategies.ca';

-- If the user exists, grant them admin access with active subscription
UPDATE profiles
SET
  role = 'admin',
  subscription_status = 'active',
  trial_ends_at = NULL,
  trial_end_date = NULL
WHERE email = 'param@pharmastrategies.ca';

-- Verify the update
SELECT id, email, role, subscription_status, trial_ends_at FROM profiles WHERE email = 'param@pharmastrategies.ca';
