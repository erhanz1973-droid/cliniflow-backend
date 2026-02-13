-- Debug doctors table structure and data
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'doctors' 
ORDER BY ordinal_position;
