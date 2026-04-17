-- ================== URGENT SUPABASE PATIENTS TABLE FIX ==================
-- RUN THIS IMMEDIATELY IN SUPABASE SQL EDITOR

-- Add missing columns to patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS address TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes TEXT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20) DEFAULT 'manual';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS app_user_id UUID NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS invited_at TIMESTAMP NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS connected_at TIMESTAMP NULL;

-- Verify columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND column_name IN ('address', 'notes', 'date_of_birth', 'patient_type', 'app_user_id', 'invited_at', 'connected_at')
ORDER BY column_name;
