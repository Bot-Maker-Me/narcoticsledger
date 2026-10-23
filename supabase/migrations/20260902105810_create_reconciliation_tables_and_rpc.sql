/*
# Create reconciliation tables and update_actual_count RPC

1. New Tables
- `reconciliation_cycles`
  - id, user_id, start_date, end_date, performed_by, verified_by, notes,
    status (in_progress, completed), created_at
- `reconciliation_items`
  - id, cycle_id, user_id, drug_id, din, description, schedule,
    opening_balance, purchased_count, dispensed_count, actual_count,
    flag (OK, Pending count, Review, Verify)

2. New RPC
- `update_actual_count(p_item_id, p_actual_count)` — updates actual_count,
  recomputes flag, scoped to authenticated owner.
- `complete_reconciliation_cycle(p_cycle_id, p_performed_by, p_verified_by, p_notes, p_start_date, p_end_date)` —
  marks cycle as completed with metadata.

3. RLS on both tables, owner-scoped CRUD.

4. Notes
- opening_balance is captured from drug_stock_levels at cycle creation time.
- purchased_count and dispensed_count are aggregated from inventory_transactions
  per drug during the cycle's date range (computed client-side from parsed files).
- Expected = opening_balance + purchased_count - dispensed_count.
- Variance = actual_count - expected.
- Flag logic: OK (variance 0), Pending count (actual not yet entered), Review (variance != 0), Verify (controlled/narcotic with variance).
*/

CREATE TABLE IF NOT EXISTS reconciliation_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  start_date date,
  end_date date,
  performed_by text,
  verified_by text,
  notes text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_cycles" ON reconciliation_cycles;
CREATE POLICY "select_own_cycles" ON reconciliation_cycles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_cycles" ON reconciliation_cycles;
CREATE POLICY "insert_own_cycles" ON reconciliation_cycles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_cycles" ON reconciliation_cycles;
CREATE POLICY "update_own_cycles" ON reconciliation_cycles FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_cycles" ON reconciliation_cycles;
CREATE POLICY "delete_own_cycles" ON reconciliation_cycles FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cycles_user_id ON reconciliation_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_cycles_status ON reconciliation_cycles(status);

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
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reconciliation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_recon_items" ON reconciliation_items;
CREATE POLICY "select_own_recon_items" ON reconciliation_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_recon_items" ON reconciliation_items;
CREATE POLICY "insert_own_recon_items" ON reconciliation_items FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_recon_items" ON reconciliation_items;
CREATE POLICY "update_own_recon_items" ON reconciliation_items FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_recon_items" ON reconciliation_items;
CREATE POLICY "delete_own_recon_items" ON reconciliation_items FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recon_items_cycle_id ON reconciliation_items(cycle_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_user_id ON reconciliation_items(user_id);

-- RPC: update actual count and recompute flag
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

-- RPC: complete a reconciliation cycle
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
