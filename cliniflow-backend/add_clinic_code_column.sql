-- ================== ADD CLINIC CODE COLUMN ==================
-- This migration adds clinic_code column to patients table if it doesn't exist

-- Add clinic_code column to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS clinic_code TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_clinic_code ON patients(clinic_code);

-- Update existing records to have default clinic_code
UPDATE patients 
SET clinic_code = 'ERHANCAN'
WHERE clinic_code IS NULL;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
  AND column_name = 'clinic_code'
ORDER BY column_name;
