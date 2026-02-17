-- Add unique constraint for primary diagnosis per tooth
CREATE UNIQUE INDEX IF NOT EXISTS unique_primary_per_tooth
ON encounter_diagnoses (encounter_id, tooth_number)
WHERE is_primary = true;
