-- Add file_name column to track which file a transaction came from
-- This allows users to delete all transactions from a specific file

ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Add index for faster file_name lookups
CREATE INDEX IF NOT EXISTS idx_transactions_file_name ON inventory_transactions(file_name);
