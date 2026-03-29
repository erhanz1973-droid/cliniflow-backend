-- Migration: Add tooth_number to encounter_diagnoses
ALTER TABLE encounter_diagnoses ADD COLUMN IF NOT EXISTS tooth_number INTEGER;

-- Optional: Add index for performance
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_encounter_id_tooth_number ON encounter_diagnoses(encounter_id, tooth_number);
