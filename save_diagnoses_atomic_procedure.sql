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
    v_inserted_count INTEGER;
    v_result JSON;
    d RECORD;
BEGIN
    -- Start transaction
    BEGIN
    
    -- Count how many primary diagnoses are being submitted
    SELECT COUNT(*) INTO v_primary_count
    FROM jsonb_array_elements(p_diagnoses) AS diag
    WHERE (diag->>'is_primary')::boolean = true;
    
    -- Count secondary diagnoses
    SELECT COUNT(*) INTO v_secondary_count
    FROM jsonb_array_elements(p_diagnoses) AS diag
    WHERE (diag->>'is_primary')::boolean = false;
    
    -- RAISE NOTICE 'Processing %d primary and %d secondary diagnoses', v_primary_count, v_secondary_count;
    
    -- idx_encounter_diagnoses_one_primary_true: at most ONE is_primary = true per encounter (all teeth).
    -- Old logic cleared only matching tooth_numbers, leaving another tooth's primary → duplicate key on insert.
    IF v_primary_count > 0 THEN
        UPDATE encounter_diagnoses
        SET is_primary = false
        WHERE encounter_id = p_encounter_id
          AND is_primary = true;

        RAISE NOTICE 'Cleared all primary flags for encounter % before insert', p_encounter_id;
    END IF;
    
    -- DEBUG: Log incoming JSON data
    RAISE NOTICE 'Diagnoses JSON: %', p_diagnoses;
    RAISE NOTICE 'JSON length: %', jsonb_array_length(p_diagnoses);
    
    -- DEBUG: Verify JSON elements
    FOR d IN SELECT jsonb_array_elements(p_diagnoses) AS diagnosis_item
    LOOP
      RAISE NOTICE 'Item: %', d.diagnosis_item;
      RAISE NOTICE 'ICD10 Code: %', d.diagnosis_item->>'icd10_code';
      RAISE NOTICE 'Tooth Number: %', d.diagnosis_item->>'tooth_number';
      RAISE NOTICE 'Is Primary: %', d.diagnosis_item->>'is_primary';
    END LOOP;
    
    -- Insert new diagnoses; at most one is_primary true per batch (last primary in array wins).
    INSERT INTO encounter_diagnoses (
        encounter_id,
        created_by_doctor_id,
        icd10_code,
        icd10_description,
        is_primary,
        tooth_number
    )
    WITH elems AS (
        SELECT elem, o
        FROM jsonb_array_elements(p_diagnoses::jsonb) WITH ORDINALITY AS t(elem, o)
    ),
    win AS (
        SELECT MAX(o) FILTER (WHERE COALESCE((elem->>'is_primary')::boolean, false)) AS win_o
        FROM elems
    )
    SELECT
        p_encounter_id,
        p_doctor_id,
        e.elem->>'icd10_code',
        e.elem->>'icd10_description',
        (w.win_o IS NOT NULL
            AND COALESCE((e.elem->>'is_primary')::boolean, false)
            AND e.o = w.win_o),
        e.elem->>'tooth_number'
    FROM elems e
    CROSS JOIN win w;
    
    -- DEBUG: Log insert results
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    RAISE NOTICE 'Inserted % diagnoses', v_inserted_count;
    
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
                    'tooth_number', tooth_number,
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
$$

-- Grant execute permission
GRANT EXECUTE ON FUNCTION save_diagnoses_atomic TO authenticated, anon;
