-- Debug Admin Timeline Setup
-- Check if table and function exist

-- 1️⃣ Check if table exists
SELECT 
    table_name,
    table_type,
    is_insertable_into
FROM information_schema.tables 
WHERE table_name = 'admin_timeline_events'
AND table_schema = 'public';

-- 2️⃣ Check if function exists
SELECT 
    routine_name,
    routine_type,
    data_type,
    external_language
FROM information_schema.routines 
WHERE routine_name = 'add_timeline_event'
AND routine_schema = 'public';

-- 3️⃣ Check table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'admin_timeline_events'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4️⃣ Check permissions
SELECT 
    grantee,
    privilege_type,
    table_schema,
    table_name
FROM information_schema.role_table_grants 
WHERE table_name = 'admin_timeline_events'
AND table_schema = 'public';

-- 5️⃣ Try simple function creation without SECURITY DEFINER
DROP FUNCTION IF EXISTS add_timeline_event CASCADE;

CREATE OR REPLACE FUNCTION add_timeline_event(
    p_clinic_id UUID,
    p_type VARCHAR(50),
    p_message TEXT,
    p_reference_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO admin_timeline_events (
        clinic_id,
        type,
        reference_id,
        message,
        details,
        created_by
    )
    VALUES (
        p_clinic_id,
        p_type,
        p_reference_id,
        p_message,
        p_details,
        p_created_by
    )
    RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$;

-- 6️⃣ Test function with explicit type casts
SELECT add_timeline_event(
    '00000000-0000-0000-0000-000000000000'::UUID,
    'TEST_EVENT'::VARCHAR,
    'Test message'::TEXT
);

-- 7️⃣ Check if test event was created
SELECT 
    id,
    clinic_id,
    type,
    message,
    created_at
FROM admin_timeline_events
WHERE type = 'TEST_EVENT'
ORDER BY created_at DESC
LIMIT 1;
