/*
# Create inventory_transactions table and add_inventory_transaction RPC

1. New Tables
- `inventory_transactions`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users with cascade delete)
  - `drug_id` (uuid, not null, references drugs with cascade delete)
  - `type` (text, not null — one of: PURCHASE, DISPENSE, ADJUSTMENT)
  - `quantity` (integer, not null — positive for purchase, negative for dispense/adjustment)
  - `notes` (text, nullable — optional notes about the transaction)
  - `source` (text, not null, defaults to 'manual' — where the transaction came from)
  - `created_at` (timestamptz, defaults to now())

2. New RPC Function
- `add_inventory_transaction(p_drug_id, p_type, p_quantity, p_notes, p_source)`
  - Validates the caller owns the drug.
  - Locks the drug row with FOR UPDATE to prevent concurrent race conditions.
  - Computes current stock from the drug_stock_levels view.
  - Prevents negative resulting stock.
  - Inserts the transaction row and returns it.
  - SECURITY DEFINER, scoped to authenticated role only.

3. Modified Views
- `drug_stock_levels` — dropped and recreated to compute current_stock as SUM of
  all inventory_transactions quantities for that drug. Column type changes from
  integer to bigint (SUM returns bigint), so the view must be dropped first.

4. Security (RLS)
- Enable RLS on `inventory_transactions`.
- Owner-scoped CRUD: authenticated users can only access their own transactions.

5. Important Notes
- Stock is always the sum of all transaction quantities for a drug.
- The RPC prevents negative stock for DISPENSE and ADJUSTMENT types.
- PURCHASE always has positive quantity (validated in the function).
*/

-- Drop existing view first (column type changes from int to bigint)
DROP VIEW IF EXISTS drug_stock_levels;

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_id uuid NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('PURCHASE', 'DISPENSE', 'ADJUSTMENT')),
  quantity integer NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON inventory_transactions;
CREATE POLICY "select_own_transactions" ON inventory_transactions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_transactions" ON inventory_transactions;
CREATE POLICY "insert_own_transactions" ON inventory_transactions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_transactions" ON inventory_transactions;
CREATE POLICY "update_own_transactions" ON inventory_transactions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_transactions" ON inventory_transactions;
CREATE POLICY "delete_own_transactions" ON inventory_transactions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON inventory_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_drug_id ON inventory_transactions(drug_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON inventory_transactions(created_at DESC);

-- Recreate the stock view to compute from the transaction ledger
CREATE VIEW drug_stock_levels AS
SELECT
  d.id AS drug_id,
  COALESCE(SUM(t.quantity), 0) AS current_stock
FROM drugs d
LEFT JOIN inventory_transactions t ON t.drug_id = d.id
GROUP BY d.id;

ALTER VIEW drug_stock_levels SET (security_invoker = true);

-- RPC function to atomically add an inventory transaction
CREATE OR REPLACE FUNCTION add_inventory_transaction(
  p_drug_id uuid,
  p_type text,
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
  v_drug_owner uuid;
  v_current_stock bigint;
  v_resulting_stock bigint;
  v_actual_quantity integer;
  v_inserted inventory_transactions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_type NOT IN ('PURCHASE', 'DISPENSE', 'ADJUSTMENT') THEN
    RAISE EXCEPTION 'Invalid transaction type: %. Must be PURCHASE, DISPENSE, or ADJUSTMENT.', p_type;
  END IF;

  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must be non-zero';
  END IF;

  -- Lock the drug row and verify ownership
  SELECT user_id INTO v_drug_owner
  FROM drugs
  WHERE id = p_drug_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drug not found';
  END IF;

  IF v_drug_owner != v_user_id THEN
    RAISE EXCEPTION 'You do not own this drug';
  END IF;

  -- Compute current stock from the view
  SELECT current_stock INTO v_current_stock
  FROM drug_stock_levels
  WHERE drug_id = p_drug_id;

  IF v_current_stock IS NULL THEN
    v_current_stock := 0;
  END IF;

  -- Determine the actual signed quantity
  IF p_type = 'PURCHASE' THEN
    IF p_quantity < 0 THEN
      RAISE EXCEPTION 'Purchase quantity must be positive';
    END IF;
    v_actual_quantity := p_quantity;
  ELSIF p_type = 'DISPENSE' THEN
    IF p_quantity < 0 THEN
      v_actual_quantity := p_quantity;
    ELSE
      v_actual_quantity := -p_quantity;
    END IF;
  ELSE
    v_actual_quantity := p_quantity;
  END IF;

  -- Check for negative resulting stock
  v_resulting_stock := v_current_stock + v_actual_quantity;
  IF v_resulting_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Current stock: %. Requested change: %.',
      v_current_stock, v_actual_quantity;
  END IF;

  -- Insert the transaction
  INSERT INTO inventory_transactions (user_id, drug_id, type, quantity, notes)
  VALUES (v_user_id, p_drug_id, p_type, v_actual_quantity, p_notes)
  RETURNING * INTO v_inserted;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION add_inventory_transaction TO authenticated;
