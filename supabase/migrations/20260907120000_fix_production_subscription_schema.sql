-- Fix production database subscription schema inconsistencies
-- This migration ensures the database matches the expected schema

-- 1. Ensure subscription_status constraint allows 'trialing'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE profiles
ADD CONSTRAINT profiles_subscription_status_check
CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'revoked', 'none'));

-- 2. Convert any 'trial' status to 'trialing'
UPDATE profiles SET subscription_status = 'trialing' WHERE subscription_status = 'trial';

-- 3. Convert any other invalid statuses to 'trialing'
UPDATE profiles SET subscription_status = 'trialing' WHERE subscription_status NOT IN ('trialing', 'active', 'past_due', 'cancelled', 'revoked', 'none');

-- 4. Ensure get_my_profile function exists with correct signature
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  stripe_customer_id text,
  subscription_status text,
  trial_ends_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.role,
    p.stripe_customer_id,
    p.subscription_status,
    p.trial_ends_at,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.id = auth.uid();
END;
$$;

-- 5. Ensure system_settings table exists
CREATE TABLE IF NOT EXISTS system_settings (
  id int PRIMARY KEY DEFAULT 1,
  subscription_price_cents integer NOT NULL DEFAULT 2900,
  trial_days integer NOT NULL DEFAULT 14,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- 6. Insert default settings if not exists
INSERT INTO system_settings (id, subscription_price_cents, trial_days)
VALUES (1, 2900, 14)
ON CONFLICT (id) DO NOTHING;

-- 7. Fix null trial_ends_at for trialing users
UPDATE profiles
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE trial_ends_at IS NULL AND subscription_status = 'trialing';

-- 8. Ensure proper permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE system_settings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

-- 9. Ensure RLS policies for system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_system_settings" ON system_settings;
CREATE POLICY "read_system_settings" ON system_settings
  FOR SELECT TO authenticated
  USING (true);
