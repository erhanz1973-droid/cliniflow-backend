-- Postgres function to aggregate monthly procedure counts for a clinic in a given year
CREATE OR REPLACE FUNCTION get_monthly_procedure_counts(
    p_clinic_id UUID,
    p_year INT
)
RETURNS TABLE(month INT, procedure_count INT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        EXTRACT(MONTH FROM et.created_at)::INT AS month,
        COUNT(*) AS procedure_count
    FROM encounter_treatments et
    JOIN encounters e ON et.encounter_id = e.id
    WHERE e.clinic_id = p_clinic_id
      AND EXTRACT(YEAR FROM et.created_at) = p_year
      AND et.status IN ('planned', 'done')
    GROUP BY month
    ORDER BY month;
END;
$$ LANGUAGE plpgsql STABLE;
