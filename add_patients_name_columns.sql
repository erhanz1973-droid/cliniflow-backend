-- ================== ADD NAME COLUMNS TO PATIENTS TABLE ==================
-- RUN THIS IN SUPABASE SQL EDITOR

-- Add full_name column if it doesn't exist
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Add name column if it doesn't exist
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Verify columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND table_schema = 'public'
AND column_name IN ('full_name', 'name')
ORDER BY ordinal_position;
