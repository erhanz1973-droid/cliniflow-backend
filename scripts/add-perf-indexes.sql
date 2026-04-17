-- Performance indexes for Cliniflow
-- Run once in the Supabase SQL editor (safe to re-run — all use IF NOT EXISTS).
-- Expected impact: faster patient lookups, diagnoses fetches, and encounter queries.

-- ── encounter_diagnoses ──────────────────────────────────────────────────────
-- Used by: GET /api/doctor/patients/:id/diagnoses  (IN encounter_id)
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_encounter_id
  ON encounter_diagnoses (encounter_id);

-- Used by: admin panel / diagnoses save (WHERE patient_id)
-- (column may or may not exist depending on schema version — wrapped in DO block)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'encounter_diagnoses' AND column_name = 'patient_id'
  ) THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_patient_id
        ON encounter_diagnoses (patient_id)
    $sql$;
  END IF;
END $$;

-- ── encounter_treatments ─────────────────────────────────────────────────────
-- Used by: dashboard encounter_treatments fetch (IN encounter_id + filter scheduled_at)
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_encounter_id
  ON encounter_treatments (encounter_id);

CREATE INDEX IF NOT EXISTS idx_encounter_treatments_assigned_doctor_id
  ON encounter_treatments (assigned_doctor_id);

-- Composite index for the dashboard date-range query
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_scheduled_at
  ON encounter_treatments (scheduled_at);

-- ── patient_encounters ───────────────────────────────────────────────────────
-- Used by: collectDoctorEncounterAccess  IN (created_by_doctor_id)
CREATE INDEX IF NOT EXISTS idx_patient_encounters_created_by_doctor_id
  ON patient_encounters (created_by_doctor_id);

-- Used by: resolvePatientUuid + encounter fetches  WHERE patient_id
CREATE INDEX IF NOT EXISTS idx_patient_encounters_patient_id
  ON patient_encounters (patient_id);

-- ── patients ─────────────────────────────────────────────────────────────────
-- Used by: mergePatientIdsWithPrimaryDoctorPatients  WHERE primary_doctor_id
CREATE INDEX IF NOT EXISTS idx_patients_primary_doctor_id
  ON patients (primary_doctor_id);

-- Used by: clinic-scoped queries  WHERE clinic_code / clinic_id
CREATE INDEX IF NOT EXISTS idx_patients_clinic_code
  ON patients (clinic_code);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_id
  ON patients (clinic_id);

-- ── doctors ──────────────────────────────────────────────────────────────────
-- Used by: resolveDoctorUuid / requireDoctorAuth  WHERE email / doctor_id
CREATE INDEX IF NOT EXISTS idx_doctors_email
  ON doctors (email);

CREATE INDEX IF NOT EXISTS idx_doctors_doctor_id
  ON doctors (doctor_id);
