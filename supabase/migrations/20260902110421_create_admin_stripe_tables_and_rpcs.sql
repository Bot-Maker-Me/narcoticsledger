/*
# Admin panel, Stripe subscription, and audit logging infrastructure

1. New Tables
- `profiles` — extends auth.users with role, stripe_customer_id, subscription_status, trial_ends_at
- `system_settings` — singleton row for subscription price and trial days
- `audit_logs` — admin action audit trail
- `stripe_events` — webhook idempotency log

2. New RPCs
- `admin_list_users()` — returns all users with profile info (admin only)
- `admin_extend_trial(p_user_id, p_days)` — extends a user's trial (admin only)
- `admin_activate_subscription(p_user_id)` — sets subscription_status to active (admin only)
- `admin_revoke_access(p_user_id)` — sets subscription_status to revoked (admin only)
- `admin_update_pricing(p_price_cents, p_trial_days)` — updates system_settings (admin only)
- `admin_system_health()` — returns total users, active cycles, recent webhook errors (admin only)
- `admin_list_audit_logs(p_limit)` — returns recent audit log entries (admin only)
- `get_my_profile()` — returns the current user's profile (for auth context)

3. Trigger
- Auto-creates a profiles row when a new auth.users row is inserted (default role 'user',
  subscription_status 'trialing', trial_ends_at = now() + trial_days from system_settings).

4. RLS
- profiles: users can SELECT/UPDATE their own row; admin can SELECT all.
- system_settings: SELECT for authenticated; UPDATE only via RPC (admin).
- audit_logs: SELECT for admin only; INSERT via RPC.
- stripe_events: no direct access; managed by edge functions via service role.

5. Security
- All admin RPCs are SECURITY DEFINER with ownership check (role = 'admin').
- audit_logs records every admin action with action, target_user_id, performed_by, details.
*/

-- ============ PROFILES TABLE ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  stripe_customer_id text,
  subscription_status text NOT NULL DEFAULT 'trialing' CHECK (
    subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'revoked', 'none')
  ),
  trial_ends_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;
CREATE POLICY "admin_read_all_profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status ON profiles(subscription_status);

-- ============ SYSTEM_SETTINGS TABLE ============
CREATE TABLE IF NOT EXISTS system_settings (
  id int PRIMARY KEY DEFAULT 1,
  subscription_price_cents integer NOT NULL DEFAULT 2900,
  trial_days integer NOT NULL DEFAULT 14,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_system_settings" ON system_settings;
CREATE POLICY "read_system_settings" ON system_settings
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO system_settings (id, subscription_price_cents, trial_days)
VALUES (1, 2900, 14)
ON CONFLICT (id) DO NOTHING;

-- ============ AUDIT_LOGS TABLE ============
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_audit_logs" ON audit_logs;
CREATE POLICY "admin_read_audit_logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON audit_logs(target_user_id);

-- ============ STRIPE_EVENTS TABLE ============
CREATE TABLE IF NOT EXISTS stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed);

-- ============ TRIGGER: auto-create profile on signup ============
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_days integer;
BEGIN
  SELECT trial_days INTO v_trial_days FROM system_settings WHERE id = 1;
  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

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
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============ RPC: get_my_profile ============
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_profile TO authenticated;

-- ============ RPC: admin_list_users ============
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  subscription_status text,
  trial_ends_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT role = 'admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.role, p.subscription_status, p.trial_ends_at, p.created_at
  FROM profiles p
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_users TO authenticated;

-- ============ RPC: admin_extend_trial ============
CREATE OR REPLACE FUNCTION admin_extend_trial(p_user_id uuid, p_days integer)
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
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE profiles
  SET trial_ends_at = GREATEST(COALESCE(trial_ends_at, now()), now()) + (p_days || ' days')::interval,
      subscription_status = CASE WHEN subscription_status = 'revoked' THEN 'trialing' ELSE subscription_status END,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO audit_logs (performed_by, action, target_user_id, details)
  VALUES (v_admin_id, 'extend_trial', p_user_id, jsonb_build_object('days', p_days));
END;
$$;

GRANT EXECUTE ON FUNCTION admin_extend_trial TO authenticated;

-- ============ RPC: admin_activate_subscription ============
CREATE OR REPLACE FUNCTION admin_activate_subscription(p_user_id uuid)
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
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE profiles
  SET subscription_status = 'active',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO audit_logs (performed_by, action, target_user_id, details)
  VALUES (v_admin_id, 'activate_subscription', p_user_id, null);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_activate_subscription TO authenticated;

-- ============ RPC: admin_revoke_access ============
CREATE OR REPLACE FUNCTION admin_revoke_access(p_user_id uuid)
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
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE profiles
  SET subscription_status = 'revoked',
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO audit_logs (performed_by, action, target_user_id, details)
  VALUES (v_admin_id, 'revoke_access', p_user_id, null);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_revoke_access TO authenticated;

-- ============ RPC: admin_update_pricing ============
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
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_price_cents < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;

  IF p_trial_days < 0 THEN
    RAISE EXCEPTION 'Trial days cannot be negative';
  END IF;

  UPDATE system_settings
  SET subscription_price_cents = p_price_cents,
      trial_days = p_trial_days,
      updated_at = now()
  WHERE id = 1;

  INSERT INTO audit_logs (performed_by, action, target_user_id, details)
  VALUES (v_admin_id, 'update_pricing', null, jsonb_build_object('price_cents', p_price_cents, 'trial_days', p_trial_days));
END;
$$;

GRANT EXECUTE ON FUNCTION admin_update_pricing TO authenticated;

-- ============ RPC: admin_system_health ============
CREATE OR REPLACE FUNCTION admin_system_health()
RETURNS TABLE (
  total_users bigint,
  active_subscriptions bigint,
  trialing_users bigint,
  active_cycles bigint,
  recent_webhook_errors bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT role = 'admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM profiles) AS total_users,
    (SELECT count(*) FROM profiles WHERE subscription_status = 'active') AS active_subscriptions,
    (SELECT count(*) FROM profiles WHERE subscription_status = 'trialing') AS trialing_users,
    (SELECT count(*) FROM reconciliation_cycles WHERE status = 'in_progress') AS active_cycles,
    (SELECT count(*) FROM stripe_events WHERE processed = false OR error IS NOT NULL) AS recent_webhook_errors;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_system_health TO authenticated;

-- ============ RPC: admin_list_audit_logs ============
CREATE OR REPLACE FUNCTION admin_list_audit_logs(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  performed_by uuid,
  action text,
  target_user_id uuid,
  details jsonb,
  created_at timestamptz,
  performer_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT role = 'admin' INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.performed_by,
    a.action,
    a.target_user_id,
    a.details,
    a.created_at,
    p.email AS performer_email
  FROM audit_logs a
  LEFT JOIN profiles p ON p.id = a.performed_by
  ORDER BY a.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_list_audit_logs TO authenticated;
