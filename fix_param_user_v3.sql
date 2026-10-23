-- ============================================
-- FIX PARAM USER PROFILE FOR ADMIN ACCESS (UPDATE ONLY)
-- Run this in Supabase SQL Editor
-- ============================================

-- Check if the user exists in auth.users
SELECT id, email FROM auth.users WHERE email = 'param@pharmastrategies.ca';

-- Check if profile exists
SELECT * FROM profiles WHERE email = 'param@pharmastrategies.ca';

-- Update the existing profile to admin with active subscription
UPDATE profiles
SET
  role = 'admin',
  subscription_status = 'active',
  trial_ends_at = NULL,
  trial_end_date = NULL
WHERE email = 'param@pharmastrategies.ca';

-- Verify the profile
SELECT id, email, role, subscription_status, trial_ends_at FROM profiles WHERE email = 'param@pharmastrategies.ca';
