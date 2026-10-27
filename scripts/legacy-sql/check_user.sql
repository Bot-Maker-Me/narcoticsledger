-- ============================================
-- CHECK AND MANAGE USER ACCOUNT
-- Run this in Supabase SQL Editor
-- ============================================

-- Check if user exists in auth.users
SELECT id, email, created_at, last_sign_in_at FROM auth.users WHERE email = 'piyush80545@gmail.com';

-- Check profile data
SELECT * FROM profiles WHERE email = 'piyush80545@gmail.com';
