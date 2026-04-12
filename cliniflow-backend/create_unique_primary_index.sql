-- Create unique index for primary diagnoses per tooth
-- Ensures 1 tooth = 1 primary diagnosis per encounter

CREATE UNIQUE INDEX IF NOT EXISTS unique_primary_per_tooth
ON encounter_diagnoses (encounter_id, tooth_number)
WHERE is_primary = true;
