/*
  PharmaFlow modules aligned with iApotheca-style workflows:
  delivery runs + routing metadata, recon extras, policies, incidents,
  punch clock, batch production, and med changes.
*/

-- Reconciliation extras
ALTER TABLE reconciliation_items
  ADD COLUMN IF NOT EXISTS verify_note text,
  ADD COLUMN IF NOT EXISTS locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_adjustment integer;

ALTER TABLE reconciliation_cycles
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{
    "files_uploaded": false,
    "counts_complete": false,
    "discrepancies_reviewed": false,
    "second_check": false,
    "report_exported": false
  }'::jsonb;

ALTER TABLE drugs
  ADD COLUMN IF NOT EXISTS recon_interval_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;

-- Shared owner-scoped table helper via repeated policies

CREATE TABLE IF NOT EXISTS pharmacy_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  store_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES pharmacy_teams(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'optimized', 'in_progress', 'completed')),
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES delivery_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  patient_name text NOT NULL,
  phone text,
  address text NOT NULL,
  city text,
  postal_code text,
  lat double precision,
  lng double precision,
  rx_notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'delivered', 'undeliverable', 'rescheduled', 'returned')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'collected', 'waived')),
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'square', 'other')),
  payment_amount_cents integer NOT NULL DEFAULT 0,
  undeliverable_reason text,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id uuid REFERENCES delivery_runs(id) ON DELETE CASCADE,
  stop_id uuid REFERENCES delivery_stops(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1.0',
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  staff_name text NOT NULL,
  acknowledged_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('dispensing', 'inventory', 'delivery', 'narcotic', 'other')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'closed')),
  occurred_at timestamptz DEFAULT now(),
  resolution text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_name text NOT NULL,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  din text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  lot_number text,
  check1_by text,
  check2_by text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'voided')),
  notes text,
  produced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS med_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_name text NOT NULL,
  drug_from text NOT NULL,
  drug_to text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'applied')),
  requested_by text,
  verified_by text,
  created_at timestamptz DEFAULT now()
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pharmacy_teams',
    'delivery_runs',
    'delivery_stops',
    'delivery_audit_log',
    'policies',
    'policy_acknowledgements',
    'incidents',
    'time_punches',
    'production_batches',
    'med_changes'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS select_own ON %I', t);
    EXECUTE format('CREATE POLICY select_own ON %I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS insert_own ON %I', t);
    EXECUTE format('CREATE POLICY insert_own ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS update_own ON %I', t);
    EXECUTE format('CREATE POLICY update_own ON %I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS delete_own ON %I', t);
    EXECUTE format('CREATE POLICY delete_own ON %I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_user_id ON %I(user_id)', t, t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_stops_run_id ON delivery_stops(run_id);
CREATE INDEX IF NOT EXISTS idx_delivery_audit_run_id ON delivery_audit_log(run_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_policy_id ON policy_acknowledgements(policy_id);
