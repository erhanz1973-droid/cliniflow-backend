-- Speed lookups used when saving multi-tooth / bridge procedures (batch POST).
-- EQ on patients.patient_id + patients.clinic_id; clinics often joined by code.

CREATE INDEX IF NOT EXISTS idx_patients_patient_id_lookup
  ON public.patients (patient_id);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_patient
  ON public.patients (clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_clinics_clinic_code_normalized
  ON public.clinics (upper(clinic_code));
