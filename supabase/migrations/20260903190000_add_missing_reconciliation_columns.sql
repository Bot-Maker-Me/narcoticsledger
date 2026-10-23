-- Add missing columns to reconciliation_items table
ALTER TABLE reconciliation_items 
ADD COLUMN IF NOT EXISTS verify_note text,
ADD COLUMN IF NOT EXISTS locations jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS suggested_adjustment integer;

-- Add missing checklist column to reconciliation_cycles table
ALTER TABLE reconciliation_cycles 
ADD COLUMN IF NOT EXISTS checklist jsonb;
