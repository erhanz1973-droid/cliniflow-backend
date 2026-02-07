-- ================== ADD FULL_NAME COLUMN TO PATIENTS TABLE ==================
-- RUN THIS IN SUPABASE SQL EDITOR

-- Add full_name column if it doesn't exist
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Verify column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND table_schema = 'public'
AND column_name = 'full_name';
