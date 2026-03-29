-- Patient Medical Forms table
-- Stores health history form submitted by patients before appointments

CREATE TABLE IF NOT EXISTS patient_medical_forms (
  patient_id  UUID        PRIMARY KEY,
  form_data   JSONB       NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_patient_medical_forms_patient_id ON patient_medical_forms(patient_id);

-- Enable RLS
ALTER TABLE patient_medical_forms ENABLE ROW LEVEL SECURITY;

-- Service role bypass (backend uses service role key)
CREATE POLICY "service_role_all" ON patient_medical_forms
  FOR ALL TO service_role USING (true);
