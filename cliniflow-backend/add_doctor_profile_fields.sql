-- ================== ADD DOCTOR PROFILE FIELDS ==================
-- This migration adds department, specialties, title, experience_years, and languages fields to patients table

-- Add new columns to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS specialties TEXT,
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS experience_years INTEGER,
ADD COLUMN IF NOT EXISTS languages TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_department ON patients(department);
CREATE INDEX IF NOT EXISTS idx_patients_role ON patients(role);

-- Update existing records to have default values
UPDATE patients 
SET 
  department = CASE 
    WHEN role = 'DOCTOR' THEN 'Ağız, Çene ve Diş Sağlığı'
    ELSE NULL 
  END,
  specialties = CASE 
    WHEN role = 'DOCTOR' THEN '[]'
    ELSE NULL 
  END,
  title = CASE 
    WHEN role = 'DOCTOR' THEN NULL
    ELSE NULL 
  END,
  experience_years = CASE 
    WHEN role = 'DOCTOR' THEN 0
    ELSE NULL 
  END,
  languages = CASE 
    WHEN role = 'DOCTOR' THEN '[]'
    ELSE NULL 
  END
WHERE department IS NULL OR specialties IS NULL OR title IS NULL OR experience_years IS NULL OR languages IS NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
  AND column_name IN ('department', 'specialties', 'title', 'experience_years', 'languages')
ORDER BY column_name;
