-- Add draft status to reconciliation cycles

-- 1. Update the status constraint to include 'draft'
ALTER TABLE reconciliation_cycles DROP CONSTRAINT IF EXISTS reconciliation_cycles_status_check;
ALTER TABLE reconciliation_cycles
ADD CONSTRAINT reconciliation_cycles_status_check
CHECK (status IN ('draft', 'in_progress', 'completed'));

-- 2. Add a name column for drafts (optional, for easier identification)
ALTER TABLE reconciliation_cycles ADD COLUMN IF NOT EXISTS name text;

-- 3. Update existing draft cycles (if any) to have the proper status
UPDATE reconciliation_cycles SET status = 'draft' WHERE status = 'in_progress' AND checklist IS NULL;
