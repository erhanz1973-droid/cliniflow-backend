-- Add treatment column to patients table
-- This fixes the "column patients.treatment does not exist" error

ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS treatment JSONB DEFAULT '{}';

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_patients_treatment ON patients USING GIN (treatment);

-- Add comment for documentation
COMMENT ON COLUMN patients.treatment IS 'Treatment data stored as JSONB for legacy compatibility';
