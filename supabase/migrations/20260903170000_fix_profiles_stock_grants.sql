/*
  Backfill missing profiles (users created before the signup trigger),
  let authenticated users insert their own profile, make get_my_profile
  self-heal, and grant SELECT on the stock view used by the app.
*/

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

INSERT INTO profiles (id, email, role, subscription_status, trial_ends_at)
SELECT
  u.id,
  u.email,
  'user',
  'trialing',
  now() + interval '14 days'
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile profiles;
  v_trial_days integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF FOUND THEN
    RETURN v_profile;
  END IF;

  SELECT trial_days INTO v_trial_days FROM system_settings WHERE id = 1;
  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

  INSERT INTO profiles (id, email, role, subscription_status, trial_ends_at)
  SELECT
    auth.uid(),
    u.email,
    'user',
    'trialing',
    now() + (v_trial_days || ' days')::interval
  FROM auth.users u
  WHERE u.id = auth.uid()
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  RETURN v_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_profile TO authenticated;
GRANT SELECT ON drug_stock_levels TO authenticated;
