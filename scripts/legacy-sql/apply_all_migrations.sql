-- ============================================
-- PHARMFLOW - DATABASE SETUP (SAFE VERSION)
-- Run this in Supabase SQL Editor
-- This script uses IF NOT EXISTS and DROP POLICY IF EXISTS to handle partial migrations
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- DRUGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS drugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  din text NOT NULL UNIQUE,
  description text,
  schedule text,
  pack_size integer,
  reorder_level integer DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE drugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own drugs" ON drugs;
CREATE POLICY "Users can view all drugs" ON drugs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own drugs" ON drugs;
CREATE POLICY "Users can insert own drugs" ON drugs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own drugs" ON drugs;
CREATE POLICY "Users can update own drugs" ON drugs FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own drugs" ON drugs;
CREATE POLICY "Users can delete own drugs" ON drugs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- INVENTORY TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_id uuid REFERENCES drugs(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('purchase', 'dispense', 'adjustment', 'destruction')),
  quantity integer NOT NULL,
  date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON inventory_transactions;
CREATE POLICY "Users can view own transactions" ON inventory_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own transactions" ON inventory_transactions;
CREATE POLICY "Users can insert own transactions" ON inventory_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own transactions" ON inventory_transactions;
CREATE POLICY "Users can update own transactions" ON inventory_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own transactions" ON inventory_transactions;
CREATE POLICY "Users can delete own transactions" ON inventory_transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- DRUG STOCK LEVELS VIEW
-- ============================================
CREATE OR REPLACE VIEW drug_stock_levels AS
SELECT 
  d.id,
  d.user_id,
  d.din,
  d.description,
  d.schedule,
  COALESCE(SUM(
    CASE 
      WHEN it.transaction_type IN ('purchase', 'adjustment') THEN it.quantity
      WHEN it.transaction_type IN ('dispense', 'destruction') THEN -it.quantity
      ELSE 0
    END
  ), 0) as current_stock
FROM drugs d
LEFT JOIN inventory_transactions it ON d.id = it.drug_id
GROUP BY d.id, d.user_id, d.din, d.description, d.schedule;

-- ============================================
-- PRESCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_name text NOT NULL,
  drug_id uuid REFERENCES drugs(id) ON DELETE SET NULL,
  quantity_dispensed integer NOT NULL,
  dispensed_date date NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own prescriptions" ON prescriptions;
CREATE POLICY "Users can view own prescriptions" ON prescriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own prescriptions" ON prescriptions;
CREATE POLICY "Users can insert own prescriptions" ON prescriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own prescriptions" ON prescriptions;
CREATE POLICY "Users can update own prescriptions" ON prescriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own prescriptions" ON prescriptions;
CREATE POLICY "Users can delete own prescriptions" ON prescriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- RECONCILIATION CYCLES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reconciliation_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date,
  end_date date,
  performed_by text,
  verified_by text,
  notes text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  checklist jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cycles" ON reconciliation_cycles;
CREATE POLICY "Users can view own cycles" ON reconciliation_cycles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own cycles" ON reconciliation_cycles;
CREATE POLICY "Users can insert own cycles" ON reconciliation_cycles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own cycles" ON reconciliation_cycles;
CREATE POLICY "Users can update own cycles" ON reconciliation_cycles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own cycles" ON reconciliation_cycles;
CREATE POLICY "Users can delete own cycles" ON reconciliation_cycles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- RECONCILIATION ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES reconciliation_cycles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_id uuid REFERENCES drugs(id) ON DELETE SET NULL,
  din text NOT NULL,
  description text,
  schedule text,
  opening_balance integer NOT NULL DEFAULT 0,
  purchased_count integer NOT NULL DEFAULT 0,
  dispensed_count integer NOT NULL DEFAULT 0,
  actual_count integer,
  flag text NOT NULL DEFAULT 'Pending count' CHECK (flag IN ('OK', 'Pending count', 'Review', 'Verify')),
  verify_note text,
  locations jsonb DEFAULT '[]'::jsonb,
  suggested_adjustment integer,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recon items" ON reconciliation_items;
CREATE POLICY "Users can view own recon items" ON reconciliation_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own recon items" ON reconciliation_items;
CREATE POLICY "Users can insert own recon items" ON reconciliation_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own recon items" ON reconciliation_items;
CREATE POLICY "Users can update own recon items" ON reconciliation_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own recon items" ON reconciliation_items;
CREATE POLICY "Users can delete own recon items" ON reconciliation_items FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================
-- RPC: UPDATE ACTUAL COUNT
-- ============================================
CREATE OR REPLACE FUNCTION update_actual_count(
  p_item_id uuid,
  p_actual_count integer
)
RETURNS reconciliation_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item reconciliation_items;
  v_expected integer;
  v_variance integer;
  v_flag text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_item FROM reconciliation_items WHERE id = p_item_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reconciliation item not found';
  END IF;

  IF v_item.user_id != v_user_id THEN
    RAISE EXCEPTION 'You do not own this item';
  END IF;

  v_expected := v_item.opening_balance + v_item.purchased_count - v_item.dispensed_count;

  IF p_actual_count IS NULL THEN
    v_flag := 'Pending count';
    v_variance := NULL;
  ELSE
    v_variance := p_actual_count - v_expected;
    IF v_variance = 0 THEN
      v_flag := 'OK';
    ELSIF v_item.schedule IN ('Narcotic', 'Controlled') THEN
      v_flag := 'Verify';
    ELSE
      v_flag := 'Review';
    END IF;
  END IF;

  UPDATE reconciliation_items
  SET actual_count = p_actual_count,
      flag = v_flag
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

GRANT EXECUTE ON FUNCTION update_actual_count TO authenticated;

-- ============================================
-- RPC: COMPLETE RECONCILIATION CYCLE
-- ============================================
CREATE OR REPLACE FUNCTION complete_reconciliation_cycle(
  p_cycle_id uuid,
  p_performed_by text DEFAULT NULL,
  p_verified_by text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS reconciliation_cycles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_cycle reconciliation_cycles;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_cycle FROM reconciliation_cycles WHERE id = p_cycle_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cycle not found';
  END IF;

  IF v_cycle.user_id != v_user_id THEN
    RAISE EXCEPTION 'You do not own this cycle';
  END IF;

  UPDATE reconciliation_cycles
  SET status = 'completed',
      performed_by = COALESCE(p_performed_by, performed_by),
      verified_by = COALESCE(p_verified_by, verified_by),
      notes = COALESCE(p_notes, notes),
      start_date = COALESCE(p_start_date, start_date),
      end_date = COALESCE(p_end_date, end_date)
  WHERE id = p_cycle_id
  RETURNING * INTO v_cycle;

  RETURN v_cycle;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_reconciliation_cycle TO authenticated;

-- ============================================
-- RPC: DISPENSE DRUG
-- ============================================
CREATE OR REPLACE FUNCTION dispense_drug(
  p_drug_id uuid,
  p_quantity integer,
  p_patient_name text,
  p_notes text DEFAULT NULL
)
RETURNS inventory_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transaction inventory_transactions;
  v_current_stock integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check current stock
  SELECT COALESCE(current_stock, 0) INTO v_current_stock
  FROM drug_stock_levels
  WHERE id = p_drug_id AND user_id = v_user_id;

  IF v_current_stock IS NULL THEN
    RAISE EXCEPTION 'Drug not found';
  END IF;

  IF v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Insufficient stock. Current: %, Requested: %', v_current_stock, p_quantity;
  END IF;

  -- Create dispense transaction
  INSERT INTO inventory_transactions (user_id, drug_id, transaction_type, quantity, date, notes)
  VALUES (v_user_id, p_drug_id, 'dispense', p_quantity, CURRENT_DATE, p_notes)
  RETURNING * INTO v_transaction;

  -- Create prescription record
  INSERT INTO prescriptions (user_id, drug_id, patient_name, quantity_dispensed, dispensed_date, notes)
  VALUES (v_user_id, p_drug_id, p_patient_name, p_quantity, CURRENT_DATE, p_notes);

  RETURN v_transaction;
END;
$$;

GRANT EXECUTE ON FUNCTION dispense_drug TO authenticated;

-- ============================================
-- RPC: ADD PURCHASE
-- ============================================
CREATE OR REPLACE FUNCTION add_purchase(
  p_drug_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS inventory_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transaction inventory_transactions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO inventory_transactions (user_id, drug_id, transaction_type, quantity, date, notes)
  VALUES (v_user_id, p_drug_id, 'purchase', p_quantity, CURRENT_DATE, p_notes)
  RETURNING * INTO v_transaction;

  RETURN v_transaction;
END;
$$;

GRANT EXECUTE ON FUNCTION add_purchase TO authenticated;

-- ============================================
-- RPC: ADJUST STOCK
-- ============================================
CREATE OR REPLACE FUNCTION adjust_stock(
  p_drug_id uuid,
  p_quantity integer,
  p_notes text DEFAULT NULL
)
RETURNS inventory_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_transaction inventory_transactions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO inventory_transactions (user_id, drug_id, transaction_type, quantity, date, notes)
  VALUES (v_user_id, p_drug_id, 'adjustment', p_quantity, CURRENT_DATE, p_notes)
  RETURNING * INTO v_transaction;

  RETURN v_transaction;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_stock TO authenticated;

-- ============================================
-- PROFILES TABLE (for stock grants)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  trial_ends_at timestamptz,
  trial_end_date timestamptz,
  subscription_status text DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'cancelled', 'revoked', 'none')),
  stripe_customer_id text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- ============================================
-- TRIGGER: CREATE PROFILE ON USER SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================
-- STORAGE BUCKETS
-- ============================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('reports', 'reports', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload reports" ON storage.objects;
CREATE POLICY "Users can upload reports" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users can view own reports" ON storage.objects;
CREATE POLICY "Users can view own reports" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'reports' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- GRANT ADMIN ACCESS TO SPECIFIC USER
-- ============================================
-- Run this separately to grant admin access to piyush80545@gmail.com
-- UPDATE profiles SET role = 'admin' WHERE email = 'piyush80545@gmail.com';

-- ============================================
-- COMPLETE
-- ============================================
-- Database setup complete!
-- You can now use the PharmaFlow application.
