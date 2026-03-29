-- SIMPLIFIED DIAGNOSIS SAVING STORED PROCEDURE
-- Simple logic: handle primary conflicts, insert new diagnoses

CREATE OR REPLACE FUNCTION save_diagnoses_atomic(
    p_encounter_id UUID,
    p_doctor_id UUID,
    p_diagnoses JSON
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    d RECORD;
    v_tooth_number TEXT;
BEGIN
    -- Process each diagnosis
    FOR d IN SELECT jsonb_array_elements(p_diagnoses) AS diagnosis_item
    LOOP
        v_tooth_number := d.diagnosis_item->>'tooth_number';
        
        -- If this is a primary diagnosis, reset existing primary for this tooth
        IF (d.diagnosis_item->>'is_primary')::boolean = true THEN
            UPDATE encounter_diagnoses
            SET is_primary = false
            WHERE encounter_id = p_encounter_id
            AND tooth_number = v_tooth_number
            AND is_primary = true;
        END IF;
        
        -- Insert the new diagnosis
        INSERT INTO encounter_diagnoses (
            encounter_id,
            created_by_doctor_id,
            icd10_code,
            icd10_description,
            is_primary,
            tooth_number
        )
        SELECT
            p_encounter_id,
            p_doctor_id,
            d.diagnosis_item->>'icd10_code',
            d.diagnosis_item->>'icd10_description',
            (d.diagnosis_item->>'is_primary')::boolean,
            v_tooth_number;
            
    END LOOP;
    
    -- Return success
    RETURN json_build_object('ok', true, 'message', 'Diagnoses saved successfully');
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('ok', false, 'error', SQLERRM);
END;
$$;
