-- Optional: store clinic on each encounter (enables clinic_id in POST /api/doctor/encounters first payload).
-- Safe to run once; no-op if column already exists.

ALTER TABLE patient_encounters
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patient_encounters_clinic_id
  ON patient_encounters (clinic_id)
  WHERE clinic_id IS NOT NULL;
