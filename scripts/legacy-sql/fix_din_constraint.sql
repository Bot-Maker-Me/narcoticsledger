-- COMPLETE DATABASE SCHEMA FIX
-- This migration will add ALL missing columns to fix production database issues

-- First, let's check and fix the drugs table
DO $$
BEGIN
    -- Add pack_size column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'drugs' AND column_name = 'pack_size'
    ) THEN
        ALTER TABLE drugs ADD COLUMN pack_size INTEGER DEFAULT 1 CHECK (pack_size > 0);
    END IF;
    
    -- Add reorder_level column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'drugs' AND column_name = 'reorder_level'
    ) THEN
        ALTER TABLE drugs ADD COLUMN reorder_level INTEGER DEFAULT 0 CHECK (reorder_level >= 0);
    END IF;
END $$;

-- Now fix the inventory_transactions table
DO $$
BEGIN
    -- Drop existing check constraints to avoid conflicts
    ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
    ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_type_check;
    
    -- Add transaction_type column if it doesn't exist (some databases use transaction_type instead of type)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_transactions' AND column_name = 'transaction_type'
    ) THEN
        ALTER TABLE inventory_transactions ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'PURCHASE';
    END IF;
    
    -- Also add type column for compatibility
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_transactions' AND column_name = 'type'
    ) THEN
        ALTER TABLE inventory_transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'PURCHASE';
    END IF;
    
    -- Add source column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_transactions' AND column_name = 'source'
    ) THEN
        ALTER TABLE inventory_transactions ADD COLUMN source TEXT DEFAULT 'manual';
    END IF;
    
    -- Add date column if it doesn't exist (some databases use date instead of created_at)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_transactions' AND column_name = 'date'
    ) THEN
        ALTER TABLE inventory_transactions ADD COLUMN date TIMESTAMPTZ DEFAULT now();
    END IF;
    
    -- Add file_name column to track which file a transaction came from
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_transactions' AND column_name = 'file_name'
    ) THEN
        ALTER TABLE inventory_transactions ADD COLUMN file_name TEXT;
    END IF;
    
    -- Add check constraint for transaction_type (accept both uppercase and lowercase)
    ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check 
      CHECK (transaction_type IN ('PURCHASE', 'DISPENSE', 'ADJUSTMENT', 'purchase', 'dispense', 'adjustment'));
      
    -- Add check constraint for type (accept both uppercase and lowercase)
    ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_type_check 
      CHECK (type IN ('PURCHASE', 'DISPENSE', 'ADJUSTMENT', 'purchase', 'dispense', 'adjustment'));
END $$;

-- Fix DIN constraint to be more flexible
ALTER TABLE drugs DROP CONSTRAINT IF EXISTS drugs_din_check;
ALTER TABLE drugs ADD CONSTRAINT drugs_din_check 
  CHECK (din ~ '^[0-9]{6,10}$');

-- Re-add unique constraint for drugs
ALTER TABLE drugs DROP CONSTRAINT IF EXISTS drugs_user_id_din_key;
ALTER TABLE drugs ADD CONSTRAINT drugs_user_id_din_key UNIQUE (user_id, din);

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_transactions_type ON inventory_transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_transaction_type ON inventory_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON inventory_transactions(source);