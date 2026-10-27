-- ============================================
-- SET USER AS ADMIN WITH ACTIVE SUBSCRIPTION
-- Run this in Supabase SQL Editor
-- ============================================

-- First, check if the user exists
SELECT id, email, role, subscription_status FROM profiles WHERE email = 'piyush80545@gmail.com';

-- Update the user to admin with active subscription
UPDATE profiles
SET
  role = 'admin',
  subscription_status = 'active',
  trial_ends_at = NULL,
  trial_end_date = NULL
WHERE email = 'piyush80545@gmail.com';

-- Verify the update
SELECT id, email, role, subscription_status, trial_ends_at FROM profiles WHERE email = 'piyush80545@gmail.com';
