-- ============================================================
-- Migration: switch single source of truth to patient_medical_forms
-- Run once in Supabase SQL Editor
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT)
-- ============================================================

-- Step 1: ensure the table exists with the full schema
CREATE TABLE IF NOT EXISTS patient_medical_forms (
  patient_id   UUID         PRIMARY KEY,
  form_data    JSONB        NOT NULL DEFAULT '{}',
  is_complete  BOOLEAN      NOT NULL DEFAULT false,
  clinic_code  TEXT,
  risk_flags   JSONB,
  submitted_at TIMESTAMPTZ,            -- first time form was completed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: add columns that may be missing in older installs
ALTER TABLE patient_medical_forms
  ADD COLUMN IF NOT EXISTS is_complete  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clinic_code  TEXT,
  ADD COLUMN IF NOT EXISTS risk_flags   JSONB,
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW();

-- Step 3: RLS + service-role policy
ALTER TABLE patient_medical_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON patient_medical_forms;
CREATE POLICY "service_role_all" ON patient_medical_forms
  FOR ALL TO service_role USING (true);

-- Step 4: index for clinic-scoped lookups
CREATE INDEX IF NOT EXISTS idx_pmf_patient_id  ON patient_medical_forms (patient_id);
CREATE INDEX IF NOT EXISTS idx_pmf_clinic_code ON patient_medical_forms (clinic_code);

-- Step 5: migrate valid records from patient_health_forms
--   Only rows whose patient_id is a proper UUID are migrated.
--   ON CONFLICT: latest updated_at wins.
INSERT INTO patient_medical_forms
  (patient_id, form_data, is_complete, clinic_code, risk_flags,
   submitted_at, created_at, updated_at)
SELECT
  patient_id::UUID,
  COALESCE(form_data, '{}'),
  COALESCE(is_complete, false),
  clinic_code,
  risk_flags,
  completed_at,                              -- maps to submitted_at
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW())
FROM patient_health_forms
WHERE patient_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (patient_id) DO UPDATE
  SET form_data    = EXCLUDED.form_data,
      is_complete  = EXCLUDED.is_complete,
      clinic_code  = COALESCE(EXCLUDED.clinic_code, patient_medical_forms.clinic_code),
      risk_flags   = COALESCE(EXCLUDED.risk_flags,  patient_medical_forms.risk_flags),
      submitted_at = COALESCE(patient_medical_forms.submitted_at, EXCLUDED.submitted_at),
      updated_at   = GREATEST(EXCLUDED.updated_at,  patient_medical_forms.updated_at);

-- Step 6: verification
SELECT
  (SELECT COUNT(*) FROM patient_health_forms
   WHERE patient_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS health_forms_uuid_rows,
  (SELECT COUNT(*) FROM patient_medical_forms) AS medical_forms_rows;
