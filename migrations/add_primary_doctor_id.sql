-- Add primary_doctor_id to patients table for direct doctor-patient assignment
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS primary_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_primary_doctor ON patients(primary_doctor_id);
