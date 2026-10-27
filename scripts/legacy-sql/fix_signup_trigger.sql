-- Fix the signup trigger to ensure profiles are created correctly

-- 1. Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 2. Recreate the function with proper error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_days integer;
BEGIN
  -- Get trial days from system_settings, default to 14 if not found
  SELECT trial_days INTO v_trial_days FROM system_settings WHERE id = 1;
  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

  -- Insert profile with proper trial settings
  INSERT INTO profiles (id, email, role, subscription_status, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    'trialing',
    now() + (v_trial_days || ' days')::interval
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the signup
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4. Test the function by running it manually (this will create a profile if missing)
-- This handles any users who signed up during the fix period
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id, email FROM auth.users WHERE id NOT IN (SELECT id FROM profiles) LOOP
    INSERT INTO profiles (id, email, role, subscription_status, trial_ends_at)
    VALUES (
      user_record.id,
      user_record.email,
      'user',
      'trialing',
      now() + INTERVAL '14 days'
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
