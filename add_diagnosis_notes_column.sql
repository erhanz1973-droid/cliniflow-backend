-- Adds per-tooth doctor note support for encounter diagnoses
ALTER TABLE encounter_diagnoses
ADD COLUMN IF NOT EXISTS notes TEXT;
