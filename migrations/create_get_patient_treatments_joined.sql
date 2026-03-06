-- Postgres function: get_patient_treatments_joined
-- Returns all procedures for a patient, with plan and visit info, in a single query

CREATE OR REPLACE FUNCTION get_patient_treatments_joined(p_patient_id UUID)
RETURNS TABLE (
  procedure_id UUID,
  tooth_number INT,
  procedure_name TEXT,
  status TEXT,
  visit_date DATE,
  plan_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tp.id AS procedure_id,
    tp.tooth_number,
    tp.procedure_name,
    tp.status,
    v.visit_date,
    tp.plan_id
  FROM treatment_procedures tp
  JOIN treatment_plans pl ON tp.plan_id = pl.id
  JOIN visits v ON pl.visit_id = v.id
  WHERE pl.patient_id = p_patient_id
  ORDER BY v.visit_date DESC;
END;
$$ LANGUAGE plpgsql STABLE;
