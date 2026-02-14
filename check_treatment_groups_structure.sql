-- Check current treatment_groups table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'treatment_groups' 
ORDER BY ordinal_position;
