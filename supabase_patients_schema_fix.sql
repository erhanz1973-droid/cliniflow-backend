-- ================== PATIENTS TABLE SCHEMA FIX ==================

-- Add missing columns to patients table for manual patient creation
-- Run this in Supabase SQL Editor

-- Check if columns exist before adding them
DO $$
BEGIN
    -- Add patient_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'patient_type'
    ) THEN
        ALTER TABLE patients ADD COLUMN patient_type VARCHAR(20) DEFAULT 'manual' 
        CHECK (patient_type IN ('connected', 'manual'));
        RAISE NOTICE 'Added patient_type column';
    END IF;

    -- Add app_user_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'app_user_id'
    ) THEN
        ALTER TABLE patients ADD COLUMN app_user_id UUID NULL REFERENCES auth.users(id);
        RAISE NOTICE 'Added app_user_id column';
    END IF;

    -- Add invited_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'invited_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN invited_at TIMESTAMP NULL;
        RAISE NOTICE 'Added invited_at column';
    END IF;

    -- Add connected_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'connected_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN connected_at TIMESTAMP NULL;
        RAISE NOTICE 'Added connected_at column';
    END IF;

    -- Add address column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'address'
    ) THEN
        ALTER TABLE patients ADD COLUMN address TEXT NULL;
        RAISE NOTICE 'Added address column';
    END IF;

    -- Add notes column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE patients ADD COLUMN notes TEXT NULL;
        RAISE NOTICE 'Added notes column';
    END IF;

    -- Add date_of_birth column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'date_of_birth'
    ) THEN
        ALTER TABLE patients ADD COLUMN date_of_birth DATE NULL;
        RAISE NOTICE 'Added date_of_birth column';
    END IF;

END $$;

-- Show current patients table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
ORDER BY ordinal_position;
