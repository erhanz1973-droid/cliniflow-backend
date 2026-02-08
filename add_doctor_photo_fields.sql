-- ================== ADD DOCTOR PROFILE UPLOAD FIELDS ==================
-- This migration adds profile photo and diploma upload fields to patients table

-- Add new columns to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
ADD COLUMN IF NOT EXISTS diploma_file_url TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_profile_photo ON patients(profile_photo_url);

-- Update existing records to have default values
UPDATE patients 
SET 
  profile_photo_url = NULL,
  diploma_file_url = NULL
WHERE profile_photo_url IS NULL OR diploma_file_url IS NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
  AND column_name IN ('profile_photo_url', 'diploma_file_url')
ORDER BY column_name;
