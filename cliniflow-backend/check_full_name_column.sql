-- ================== CHECK FULL_NAME COLUMN ==================
-- RUN THIS IN SUPABASE SQL EDITOR

-- Check if full_name column exists
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND table_schema = 'public'
AND column_name = 'full_name';

-- If no results, column doesn't exist
-- Run this to add it:
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Verify it was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND table_schema = 'public'
AND column_name = 'full_name';
