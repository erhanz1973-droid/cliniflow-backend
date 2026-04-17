-- ============================================================
-- FULL RESET: medical form tables
-- Run in Supabase SQL Editor
-- ⚠️  This drops ALL existing health/medical form data.
-- ============================================================

-- Step 1: drop legacy tables
DROP TABLE IF EXISTS patient_health_forms CASCADE;
DROP TABLE IF EXISTS patient_medical_forms  CASCADE;

-- Step 2: create clean table
CREATE TABLE patient_medical_forms (
  patient_id   UUID         PRIMARY KEY,
  form_data    JSONB        NOT NULL DEFAULT '{}',
  clinic_code  TEXT,
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Step 3: index + RLS
CREATE INDEX idx_pmf_patient_id  ON patient_medical_forms (patient_id);
CREATE INDEX idx_pmf_clinic_code ON patient_medical_forms (clinic_code);

ALTER TABLE patient_medical_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON patient_medical_forms
  FOR ALL TO service_role USING (true);

-- Step 4: verify
SELECT COUNT(*) AS rows FROM patient_medical_forms;
