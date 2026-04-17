-- ================== ADD ROLE COLUMN TO PATIENTS ==================
-- This migration adds role column to support patient/doctor/admin roles

-- Add role column to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'PATIENT' 
CHECK (role IN ('PATIENT', 'DOCTOR', 'ADMIN'));

-- Update existing records to have PATIENT role by default
UPDATE patients 
SET role = 'PATIENT' 
WHERE role IS NULL;

-- Create index for role column for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_role ON patients(role);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' AND column_name = 'role';
