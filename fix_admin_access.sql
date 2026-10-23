-- ============================================
-- FIX ADMIN ACCESS - BYPASS SUBSCRIPTION CHECK
-- Run this in Supabase SQL Editor
-- ============================================

-- Set up the profile with admin access and active subscription
UPDATE profiles
SET
  role = 'admin',
  subscription_status = 'active',
  trial_ends_at = NULL,
  trial_end_date = NULL
WHERE email = 'piyush80545@gmail.com';

-- Verify the update
SELECT id, email, role, subscription_status, trial_ends_at FROM profiles WHERE email = 'piyush80545@gmail.com';
