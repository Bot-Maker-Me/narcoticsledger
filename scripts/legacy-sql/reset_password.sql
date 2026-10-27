-- ============================================
-- RESET USER PASSWORD
-- Run this in Supabase SQL Editor to reset password
-- NOTE: You'll need to execute this via Supabase Auth API
-- ============================================

-- Since we can't directly reset passwords in SQL for security reasons,
-- you need to use the Supabase Dashboard:

-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Find piyush80545@gmail.com
-- 3. Click on the user
-- 4. Click "Reset Password" button
-- 5. This will send a password reset email

-- Alternative: Create a new admin user with a known password
-- You can do this in the Supabase Dashboard:
-- 1. Go to Authentication → Users
-- 2. Click "Add user"
-- 3. Enter email and set initial password
-- 4. After creation, run this to make them admin:

-- UPDATE profiles SET role = 'admin' WHERE email = 'your-new-email@example.com';
