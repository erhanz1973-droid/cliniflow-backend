-- ================== URGENT: ADD FULL_NAME COLUMN ==================
-- RUN THIS IN SUPABASE SQL EDITOR IMMEDIATELY

-- Add full_name column if it doesn't exist
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Verify column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND table_schema = 'public'
AND column_name = 'full_name';

-- Test update on existing patient
UPDATE patients 
SET full_name = name || ' ' || COALESCE(first_name || ' ' || last_name, '')
WHERE full_name IS NULL 
AND (name IS NOT NULL OR first_name IS NOT NULL OR last_name IS NOT NULL);

-- Check results
SELECT patient_id, name, first_name, last_name, full_name 
FROM patients 
WHERE full_name IS NOT NULL 
LIMIT 5;
