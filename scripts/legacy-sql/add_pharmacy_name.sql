-- Add pharmacy_name column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pharmacy_name text;

-- Update existing profiles to have a default pharmacy name
UPDATE profiles SET pharmacy_name = 'My Pharmacy' WHERE pharmacy_name IS NULL;
