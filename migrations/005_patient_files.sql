-- patient_files: unified table for all patient-related files (photos, x-rays, PDFs, etc.)
CREATE TABLE IF NOT EXISTS patient_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL,    -- references patients.id
  clinic_id    UUID NOT NULL,
  file_url     TEXT NOT NULL,
  file_name    TEXT NOT NULL DEFAULT '',
  file_type    TEXT NOT NULL DEFAULT 'image',   -- 'image' | 'xray' | 'pdf' | 'file'
  file_subtype TEXT,                             -- e.g. 'front_smile', 'upper_teeth' (guided photos)
  mime_type    TEXT,
  file_size    INTEGER,
  from_role    TEXT NOT NULL DEFAULT 'patient',  -- 'patient' | 'clinic' | 'admin'
  source       TEXT,                             -- 'guided_camera' | 'chat' | 'upload' | 'xray'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_id ON patient_files (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_files_clinic_id  ON patient_files (clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_files_type       ON patient_files (patient_id, file_type);
