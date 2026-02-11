-- Add license_number column to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS license_number TEXT;

-- Add department column to patients table  
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'General';

-- Add specialties column to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS specialties TEXT DEFAULT 'General';

-- Add full_name column to patients table (if not exists)
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Add clinic_id column to patients table (if not exists)
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id);

-- Update existing records to have default values
UPDATE patients 
SET license_number = 'DEFAULT_LICENSE' 
WHERE license_number IS NULL;

UPDATE patients 
SET department = 'General' 
WHERE department IS NULL;

UPDATE patients 
SET specialties = 'General' 
WHERE specialties IS NULL;

UPDATE patients 
SET full_name = name 
WHERE full_name IS NULL AND name IS NOT NULL;
