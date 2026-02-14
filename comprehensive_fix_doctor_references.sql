-- COMPREHENSIVE FIX FOR ALL created_by_doctor_id REFERENCES
-- Based on search results, fix all problematic functions and triggers

-- ARCHITECTURE DECISION:
-- Admin panel creates treatment groups → use created_by_admin_id
-- Primary doctor is a separate field → primary_doctor_id
-- Multiple doctors can be assigned → doctor_ids array

-- 1. FIX create_treatment_group_atomic FUNCTION (if it exists)
CREATE OR REPLACE FUNCTION create_treatment_group_atomic(
    p_admin_id UUID,
    p_clinic_id UUID,
    p_patient_id UUID,
    p_name TEXT,
    p_description TEXT,
    p_doctor_ids UUID[],
    p_primary_doctor_id UUID
)
RETURNS TABLE (
    group_id UUID,
    success BOOLEAN,
    message TEXT
) LANGUAGE plpgsql AS $$
BEGIN
    -- Insert treatment group with admin creator
    INSERT INTO treatment_groups (
        id,
        clinic_id,
        patient_id,
        group_name,  -- NOT created_by_doctor_id
        description,
        status,
        created_by_admin_id,  -- ✅ Correct column
        primary_doctor_id,   -- ✅ Correct column
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_clinic_id,
        p_patient_id,
        p_name,
        p_description,
        'ACTIVE',
        p_admin_id,  -- ✅ Use admin_id, not doctor_id
        p_primary_doctor_id,
        NOW()
    ) RETURNING id;

    -- Insert treatment group members
    INSERT INTO treatment_group_members (
        id,
        treatment_group_id,
        doctor_id,
        is_primary,
        status,
        created_at
    ) 
    SELECT 
        gen_random_uuid(),
        id,
        doctor_id,
        CASE WHEN doctor_id = p_primary_doctor_id THEN true ELSE false END,
        'ACTIVE',
        NOW()
    FROM (SELECT UNNEST(p_doctor_ids) as doctor_id) doctors;

    RETURN QUERY 
    SELECT id as group_id, true as success, 'Treatment group created successfully'::text as message
    FROM treatment_groups 
    WHERE id = (SELECT id FROM treatment_groups ORDER BY created_at DESC LIMIT 1);
END;
$$;

-- 2. FIX ANY TRIGGER FUNCTIONS THAT REFERENCE created_by_doctor_id
-- Example: Fix treatment_groups audit trigger
CREATE OR REPLACE FUNCTION audit_treatment_groups()
RETURNS TRIGGER AS $$
BEGIN
    -- Log changes with correct admin reference
    INSERT INTO treatment_groups_audit (
        treatment_group_id,
        operation,
        old_values,
        new_values,
        changed_by_admin_id,  -- ✅ Correct column
        changed_at
    ) VALUES (
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE 
            WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
            ELSE row_to_json(OLD)
        END,
        CASE 
            WHEN TG_OP = 'INSERT' THEN row_to_json(NEW)
            WHEN TG_OP = 'UPDATE' THEN row_to_json(NEW)
            ELSE NULL
        END,
        COALESCE(NEW.created_by_admin_id, OLD.created_by_admin_id),  -- ✅ Correct reference
        NOW()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. DROP ALL EXISTING TRIGGERS ON treatment_groups
DROP TRIGGER IF EXISTS treatment_groups_audit_trigger ON treatment_groups;
DROP TRIGGER IF EXISTS treatment_groups_log_trigger ON treatment_groups;
DROP TRIGGER IF EXISTS treatment_groups_activity_trigger ON treatment_groups;
DROP TRIGGER IF EXISTS set_treatment_groups_defaults ON treatment_groups;
DROP TRIGGER IF EXISTS treatment_groups_insert_trigger ON treatment_groups;
DROP TRIGGER IF EXISTS treatment_groups_update_trigger ON treatment_groups;

-- 4. CREATE CLEAN TRIGGERS WITH CORRECT REFERENCES
-- Audit trigger
CREATE TRIGGER treatment_groups_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON treatment_groups
    FOR EACH ROW
    EXECUTE FUNCTION audit_treatment_groups();

-- 5. VERIFY NO REMAINING REFERENCES
-- This should return no rows if all references are fixed
SELECT 
    p.proname as function_name,
    p.prosrc as function_source
FROM pg_proc p
WHERE p.prosrc ILIKE '%created_by_doctor_id%'
AND p.proname NOT LIKE '%backup%'
AND p.proname NOT LIKE '%old%';

-- 6. FINAL VERIFICATION - Check treatment_groups structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'treatment_groups' 
AND column_name IN ('created_by_admin_id', 'primary_doctor_id', 'clinic_id', 'patient_id')
ORDER BY column_name;

-- 7. TEST THE FUNCTION (uncomment to test)
-- SELECT * FROM create_treatment_group_atomic(
--     'test-admin-id'::uuid,
--     'test-clinic-id'::uuid, 
--     'test-patient-id'::uuid,
--     'Test Group',
--     'Test Description',
--     ARRAY['test-doctor-1'::uuid, 'test-doctor-2'::uuid],
--     'test-primary-doctor'::uuid
-- );
