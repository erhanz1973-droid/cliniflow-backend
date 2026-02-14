-- List all triggers on treatment_groups table
SELECT 
    t.tgname as trigger_name,
    p.proname as function_name,
    t.tgenabled as is_enabled,
    t.tgrelid::regclass as table_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'treatment_groups'::regclass
AND NOT t.tgisinternal
ORDER BY t.tgname;

-- Get the source code of trigger functions
SELECT 
    p.proname as function_name,
    p.prosrc as function_source
FROM pg_proc p
JOIN pg_trigger t ON t.tgfoid = p.oid
WHERE t.tgrelid = 'treatment_groups'::regclass
AND NOT t.tgisinternal
ORDER BY p.proname;

-- Check treatment_groups table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'treatment_groups' 
ORDER BY ordinal_position;
