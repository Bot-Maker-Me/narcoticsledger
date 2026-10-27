-- ============================================
-- FIX PARAM USER PROFILE FOR ADMIN ACCESS
-- Run this in Supabase SQL Editor
-- ============================================

-- First, check if the user exists in auth.users
SELECT id, email FROM auth.users WHERE email = 'param@pharmastrategies.ca';

-- Check if profile exists
SELECT * FROM profiles WHERE email = 'param@pharmastrategies.ca';

-- If profile doesn't exist, create it with admin access
INSERT INTO profiles (id, email, role, subscription_status, trial_ends_at, trial_end_date, stripe_customer_id, created_at, updated_at)
SELECT 
  id,
  email,
  'admin' as role,
  'active' as subscription_status,
  NULL as trial_ends_at,
  NULL as trial_end_date,
  NULL as stripe_customer_id,
  NOW() as created_at,
  NOW() as updated_at
FROM auth.users 
WHERE email = 'param@pharmastrategies.ca'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  subscription_status = 'active',
  trial_ends_at = NULL,
  trial_end_date = NULL,
  updated_at = NOW();

-- Verify the profile
SELECT id, email, role, subscription_status, trial_ends_at FROM profiles WHERE email = 'param@pharmastrategies.ca';
