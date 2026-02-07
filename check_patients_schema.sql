-- ================== CHECK PATIENTS TABLE SCHEMA ==================
-- RUN THIS IN SUPABASE SQL EDITOR

-- Check patients table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'patients' 
AND table_schema = 'public'
ORDER BY ordinal_position;
