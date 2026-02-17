-- ATOMIC DIAGNOSIS SAVING STORED PROCEDURE
-- This ensures single primary diagnosis per encounter with transaction safety

CREATE OR REPLACE FUNCTION save_diagnoses_atomic(
    p_encounter_id UUID,
    p_doctor_id UUID,
    p_diagnoses JSON
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    v_primary_count INTEGER;
    v_secondary_count INTEGER;
    v_result JSON;
BEGIN
    -- Start transaction
    BEGIN;
    
    -- Count how many primary diagnoses are being submitted
    SELECT COUNT(*) INTO v_primary_count
    FROM jsonb_array_elements(p_diagnoses) AS diag
    WHERE (diag->>'is_primary')::boolean = true;
    
    -- Count secondary diagnoses
    SELECT COUNT(*) INTO v_secondary_count
    FROM jsonb_array_elements(p_diagnoses) AS diag
    WHERE (diag->>'is_primary')::boolean = false;
    
    -- RAISE NOTICE 'Processing %d primary and %d secondary diagnoses', v_primary_count, v_secondary_count;
    
    -- If we have primary diagnoses, reset existing ones first
    IF v_primary_count > 0 THEN
        UPDATE encounter_diagnoses 
        SET is_primary = false 
        WHERE encounter_id = p_encounter_id 
        AND is_primary = true;
        
        RAISE NOTICE 'Reset existing primary diagnoses for encounter %', p_encounter_id;
    END IF;
    
    -- Delete all existing diagnoses for this encounter (atomic replace)
    DELETE FROM encounter_diagnoses 
    WHERE encounter_id = p_encounter_id;
    
    -- Insert new diagnoses
    INSERT INTO encounter_diagnoses (
        encounter_id,
        icd10_code,
        icd10_description,
        is_primary,
        created_by_doctor_id,
        created_at
    )
    SELECT 
        p_encounter_id,
        (diag->>'icd10_code')::TEXT,
        (diag->>'icd10_description')::TEXT,
        (diag->>'is_primary')::boolean,
        p_doctor_id,
        NOW()
    FROM jsonb_array_elements(p_diagnoses) AS diag;
    
    -- Build result object
    SELECT json_build_object(
        'ok', true,
        'saved', v_primary_count + v_secondary_count,
        'primary_count', v_primary_count,
        'secondary_count', v_secondary_count,
        'diagnoses', (
            SELECT json_agg(
                json_build_object(
                    'icd10_code', icd10_code,
                    'icd10_description', icd10_description,
                    'is_primary', is_primary,
                    'created_at', created_at
                )
            )
            FROM encounter_diagnoses 
            WHERE encounter_id = p_encounter_id
            ORDER BY created_at DESC
        )
    ) INTO v_result;
    
    -- Commit transaction
    COMMIT;
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Rollback on any error
        ROLLBACK;
        
        RETURN json_build_object(
            'ok', false,
            'error', SQLERRM,
            'details', SQLSTATE
        );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION save_diagnoses_atomic TO authenticated, anon;
