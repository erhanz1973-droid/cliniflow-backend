-- 🔍 TREATMENT GROUPS TABLE STRUCTURE ANALYSIS
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'treatment_groups' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Mevcut indexes kontrolü
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'treatment_groups'
ORDER BY indexname;
