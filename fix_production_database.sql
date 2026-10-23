-- Fix production database schema and data issues

-- 1. First, drop the existing check constraint on subscription_status
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

-- 2. Fix subscription_status values - convert any invalid values to 'trialing'
UPDATE profiles SET subscription_status = 'trialing' WHERE subscription_status = 'trial';
UPDATE profiles SET subscription_status = 'trialing' WHERE subscription_status NOT IN ('trialing', 'active', 'past_due', 'cancelled', 'revoked', 'none');

-- 3. Add a new constraint that allows 'trialing' and other proper values
ALTER TABLE profiles
ADD CONSTRAINT profiles_subscription_status_check
CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'revoked', 'none'));

-- 4. Create the missing get_my_profile RPC function
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

-- 5. Create the missing system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id serial PRIMARY KEY,
  subscription_price_cents integer NOT NULL DEFAULT 2900,
  trial_days integer NOT NULL DEFAULT 14,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- 6. Insert default system settings if not exists
INSERT INTO system_settings (id, subscription_price_cents, trial_days, updated_at)
VALUES (1, 2900, 14, NOW())
ON CONFLICT (id) DO UPDATE SET
  subscription_price_cents = EXCLUDED.subscription_price_cents,
  trial_days = EXCLUDED.trial_days,
  updated_at = NOW();

-- 7. Fix any profiles with null trial_ends_at by setting them to 14 days from now
UPDATE profiles
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE trial_ends_at IS NULL AND subscription_status = 'trialing';

-- 8. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE system_settings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

-- 9. Create RLS policies for system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to system_settings" ON system_settings;
CREATE POLICY "Allow read access to system_settings"
  ON system_settings FOR SELECT
  TO anon, authenticated
  USING (true);
