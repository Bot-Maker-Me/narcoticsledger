-- ============================================
-- ADD ADMIN COLUMNS TO PROFILES TABLE
-- Run this in Supabase SQL Editor
-- ============================================

-- Add missing columns to profiles table (using names matching the app's types)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'revoked', 'none')),
ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Also add trial_end_date as an alias for compatibility
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS trial_end_date timestamptz;

-- Grant admin access to your email
UPDATE profiles SET role = 'admin' WHERE email = 'piyush80545@gmail.com';

-- Verify the update
SELECT id, email, role, subscription_status, trial_ends_at FROM profiles WHERE email = 'piyush80545@gmail.com';
