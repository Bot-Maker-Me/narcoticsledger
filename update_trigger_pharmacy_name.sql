-- Update the signup trigger to include pharmacy_name

-- 1. Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- 2. Recreate the function with pharmacy_name support
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_days integer;
  v_pharmacy_name text;
BEGIN
  -- Get trial days from system_settings, default to 14 if not found
  SELECT trial_days INTO v_trial_days FROM system_settings WHERE id = 1;
  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

  -- Get pharmacy name from user metadata, default to 'My Pharmacy'
  v_pharmacy_name := NEW.user_metadata->>'pharmacy_name';
  IF v_pharmacy_name IS NULL OR v_pharmacy_name = '' THEN
    v_pharmacy_name := 'My Pharmacy';
  END IF;

  -- Insert profile with proper trial settings and pharmacy name
  INSERT INTO profiles (id, email, role, subscription_status, trial_ends_at, pharmacy_name)
  VALUES (
    NEW.id,
    NEW.email,
    'user',
    'trialing',
    now() + (v_trial_days || ' days')::interval,
    v_pharmacy_name
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
