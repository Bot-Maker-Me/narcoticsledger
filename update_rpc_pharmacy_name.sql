-- Update get_my_profile RPC to include pharmacy_name

-- Drop the existing function first
DROP FUNCTION IF EXISTS get_my_profile();

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  stripe_customer_id text,
  subscription_status text,
  trial_ends_at timestamptz,
  pharmacy_name text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.role,
    p.stripe_customer_id,
    p.subscription_status,
    p.trial_ends_at,
    p.pharmacy_name,
    p.created_at,
    p.updated_at
  FROM profiles p
  WHERE p.id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;
