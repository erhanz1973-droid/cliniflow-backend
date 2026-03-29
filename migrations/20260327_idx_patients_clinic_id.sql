-- Speeds clinic-scoped patient lists (dashboard, admin filters)
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients (clinic_id);
