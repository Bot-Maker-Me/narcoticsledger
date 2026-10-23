/*
# Create prescriptions table, dispense_prescription RPC, and storage bucket

1. New Tables
- `prescriptions`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, not null, defaults to auth.uid(), references auth.users with cascade delete)
  - `drug_id` (uuid, not null, references drugs with cascade delete)
  - `patient_name` (text, not null)
  - `prescriber` (text, not null)
  - `quantity_prescribed` (integer, not null, must be > 0)
  - `quantity_dispensed` (integer, not null, defaults to 0)
  - `refills_total` (integer, not null, defaults to 0)
  - `refills_remaining` (integer, not null, defaults to 0)
  - `status` (text, not null, defaults to 'active' — one of: active, completed, cancelled)
  - `image_url` (text, nullable — optional prescription image stored in Supabase Storage)
  - `notes` (text, nullable)
  - `created_at` (timestamptz, defaults to now)

2. New RPC Function
- `dispense_prescription(p_prescription_id, p_quantity)`
  - Locks the prescription row with FOR UPDATE.
  - Validates the caller owns the prescription.
  - Validates the prescription is active.
  - Validates quantity does not exceed remaining (quantity_prescribed - quantity_dispensed).
  - Calls add_inventory_transaction to create the DISPENSE transaction (which also
    locks the drug row and prevents negative stock).
  - Updates quantity_dispensed and refills_remaining on the prescription.
  - If all refills used or all quantity dispensed, sets status to 'completed'.
  - Returns the updated prescription row.
  - SECURITY DEFINER for atomicity, scoped to authenticated.

3. Storage
- Creates a storage bucket 'prescriptions' for prescription image uploads.
- Adds storage policies so authenticated users can manage their own files.

4. Security (RLS)
- Enable RLS on `prescriptions`.
- Owner-scoped CRUD: authenticated users can only access their own prescriptions.

5. Important Notes
- The dispense RPC calls add_inventory_transaction internally, so stock is
  atomically reduced and the transaction is logged in one operation.
- If drug stock is insufficient, the RPC raises an error from add_inventory_transaction.
- The prescription status auto-transitions to 'completed' when all quantity is dispensed.
*/

CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  drug_id uuid NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  patient_name text NOT NULL,
  prescriber text NOT NULL,
  quantity_prescribed integer NOT NULL CHECK (quantity_prescribed > 0),
  quantity_dispensed integer NOT NULL DEFAULT 0,
  refills_total integer NOT NULL DEFAULT 0,
  refills_remaining integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  image_url text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_prescriptions" ON prescriptions;
CREATE POLICY "select_own_prescriptions" ON prescriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_prescriptions" ON prescriptions;
CREATE POLICY "insert_own_prescriptions" ON prescriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_prescriptions" ON prescriptions;
CREATE POLICY "update_own_prescriptions" ON prescriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_prescriptions" ON prescriptions;
CREATE POLICY "delete_own_prescriptions" ON prescriptions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_prescriptions_user_id ON prescriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_created_at ON prescriptions(created_at DESC);

-- RPC function to atomically dispense a prescription
CREATE OR REPLACE FUNCTION dispense_prescription(
  p_prescription_id uuid,
  p_quantity integer
)
RETURNS prescriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rx prescriptions;
  v_remaining integer;
  v_new_dispensed integer;
  v_new_refills_remaining integer;
  v_notes text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity to dispense must be greater than 0';
  END IF;

  -- Lock the prescription row and verify ownership
  SELECT * INTO v_rx
  FROM prescriptions
  WHERE id = p_prescription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prescription not found';
  END IF;

  IF v_rx.user_id != v_user_id THEN
    RAISE EXCEPTION 'You do not own this prescription';
  END IF;

  IF v_rx.status != 'active' THEN
    RAISE EXCEPTION 'Cannot dispense from a % prescription', v_rx.status;
  END IF;

  -- Check remaining quantity
  v_remaining := v_rx.quantity_prescribed - v_rx.quantity_dispensed;
  IF p_quantity > v_remaining THEN
    RAISE EXCEPTION 'Cannot dispense % units. Only % remaining.', p_quantity, v_remaining;
  END IF;

  -- Create the inventory DISPENSE transaction (this also locks drug + prevents negative stock)
  v_notes := 'Dispensed for prescription - Patient: ' || v_rx.patient_name || ', Prescriber: ' || v_rx.prescriber;
  PERFORM add_inventory_transaction(
    p_drug_id := v_rx.drug_id,
    p_type := 'DISPENSE',
    p_quantity := p_quantity,
    p_notes := v_notes,
    p_source := 'prescription'
  );

  -- Update the prescription
  v_new_dispensed := v_rx.quantity_dispensed + p_quantity;
  v_new_refills_remaining := GREATEST(v_rx.refills_remaining - 1, 0);

  -- If all quantity dispensed, mark as completed
  IF v_new_dispensed >= v_rx.quantity_prescribed THEN
    UPDATE prescriptions
    SET quantity_dispensed = v_new_dispensed,
        refills_remaining = v_new_refills_remaining,
        status = 'completed'
    WHERE id = p_prescription_id
    RETURNING * INTO v_rx;
  ELSE
    UPDATE prescriptions
    SET quantity_dispensed = v_new_dispensed,
        refills_remaining = v_new_refills_remaining
    WHERE id = p_prescription_id
    RETURNING * INTO v_rx;
  END IF;

  RETURN v_rx;
END;
$$;

GRANT EXECUTE ON FUNCTION dispense_prescription TO authenticated;

-- Create storage bucket for prescription images
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescriptions', 'prescriptions', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can CRUD their own files in the prescriptions bucket
DROP POLICY IF EXISTS "users_upload_prescription_images" ON storage.objects;
CREATE POLICY "users_upload_prescription_images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prescriptions' AND owner = auth.uid());

DROP POLICY IF EXISTS "users_read_own_prescription_images" ON storage.objects;
CREATE POLICY "users_read_own_prescription_images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'prescriptions' AND owner = auth.uid());

DROP POLICY IF EXISTS "users_delete_own_prescription_images" ON storage.objects;
CREATE POLICY "users_delete_own_prescription_images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'prescriptions' AND owner = auth.uid());
