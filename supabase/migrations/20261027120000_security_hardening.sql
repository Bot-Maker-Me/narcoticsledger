/*
  Security hardening (2026-10-27)

  1. Prevent privilege escalation on profiles (role, subscription, trial, stripe id).
  2. Lock down system_settings grants; writes only via admin_update_pricing RPC.
*/

DROP POLICY IF EXISTS "update_own_profile" ON profiles;

CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL AND auth.uid() = OLD.id THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    ) THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Cannot change own role';
      END IF;
      IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
        RAISE EXCEPTION 'Cannot change own subscription_status';
      END IF;
      IF NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at THEN
        RAISE EXCEPTION 'Cannot change own trial_ends_at';
      END IF;
      IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
        RAISE EXCEPTION 'Cannot change own stripe_customer_id';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged ON profiles;
CREATE TRIGGER trg_protect_profile_privileged
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION protect_profile_privileged_columns();

REVOKE ALL ON TABLE system_settings FROM anon;
REVOKE ALL ON TABLE system_settings FROM authenticated;
GRANT SELECT ON TABLE system_settings TO authenticated;

DROP POLICY IF EXISTS "read_system_settings" ON system_settings;
CREATE POLICY "read_system_settings" ON system_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION admin_update_pricing(p_price_cents integer, p_trial_days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_admin_id uuid := auth.uid();
BEGIN
  SELECT role = 'admin' INTO v_is_admin FROM profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_price_cents IS NULL OR p_price_cents < 0 THEN
    RAISE EXCEPTION 'Invalid price';
  END IF;
  IF p_trial_days IS NULL OR p_trial_days < 0 OR p_trial_days > 365 THEN
    RAISE EXCEPTION 'Invalid trial days';
  END IF;

  UPDATE system_settings
  SET subscription_price_cents = p_price_cents,
      trial_days = p_trial_days,
      updated_at = now()
  WHERE id = 1;

  INSERT INTO audit_logs (performed_by, action, target_user_id, details)
  VALUES (
    v_admin_id,
    'update_pricing',
    NULL,
    jsonb_build_object('price_cents', p_price_cents, 'trial_days', p_trial_days)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_pricing(integer, integer) TO authenticated;
