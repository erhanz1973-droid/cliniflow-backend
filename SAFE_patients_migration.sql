-- ================== SAFE PATIENTS TABLE MIGRATION ==================
-- RUN THIS IMMEDIATELY IN SUPABASE SQL EDITOR

-- First, check current patients table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
ORDER BY ordinal_position;

-- Add missing columns to existing patients table (SAFE - no data loss)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) DEFAULT 'manual';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS app_user_id UUID NULL REFERENCES auth.users(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS connected_at TIMESTAMP NULL;

-- Check if first_name and last_name columns exist
DO $$
BEGIN
    -- Add first_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'first_name'
    ) THEN
        ALTER TABLE patients ADD COLUMN first_name VARCHAR(255) NOT NULL DEFAULT 'Unknown';
        RAISE NOTICE 'Added first_name column with default value';
    END IF;

    -- Add last_name column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'last_name'
    ) THEN
        ALTER TABLE patients ADD COLUMN last_name VARCHAR(255) NOT NULL DEFAULT 'Unknown';
        RAISE NOTICE 'Added last_name column with default value';
    END IF;

    -- Add patient_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'patient_id'
    ) THEN
        ALTER TABLE patients ADD COLUMN patient_id VARCHAR(255) UNIQUE NOT NULL DEFAULT gen_random_uuid();
        RAISE NOTICE 'Added patient_id column with default value';
    END IF;

    -- Add clinic_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'clinic_id'
    ) THEN
        ALTER TABLE patients ADD COLUMN clinic_id UUID NOT NULL DEFAULT gen_random_uuid();
        RAISE NOTICE 'Added clinic_id column with default value';
    END IF;

    -- Add created_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'created_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Added created_at column with default value';
    END IF;

    -- Add updated_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE patients ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Added updated_at column with default value';
    END IF;

    -- Add status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'patients' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE patients ADD COLUMN status VARCHAR(50) DEFAULT 'PENDING';
        RAISE NOTICE 'Added status column with default value';
    END IF;
END $$;

-- Verify all required columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND column_name IN ('id', 'patient_id', 'clinic_id', 'first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'address', 'notes', 'patient_type', 'app_user_id', 'invited_at', 'connected_at', 'status', 'created_at', 'updated_at')
ORDER BY column_name;
