-- Fix patient_medical_forms rows that were saved with patients.patient_id (text col)
-- instead of patients.id (UUID PK).
-- Safe to run multiple times (ON CONFLICT DO UPDATE handles re-runs).

-- Step 1: Move rows where patient_medical_forms.patient_id matches patients.patient_id
-- (text column) to use the real patients.id UUID instead.
INSERT INTO patient_medical_forms (
  patient_id, clinic_code, form_data, is_complete,
  risk_flags, submitted_at, created_at, updated_at
)
SELECT
  p.id            AS patient_id,   -- ← correct: patients.id (UUID PK)
  pmf.clinic_code,
  pmf.form_data,
  pmf.is_complete,
  pmf.risk_flags,
  pmf.submitted_at,
  pmf.created_at,
  pmf.updated_at
FROM patient_medical_forms pmf
JOIN patients p ON p.patient_id = pmf.patient_id::text   -- cast UUID → text for comparison
WHERE pmf.patient_id <> p.id                             -- only rows with wrong id
ON CONFLICT (patient_id) DO UPDATE
  SET form_data    = EXCLUDED.form_data,
      clinic_code  = EXCLUDED.clinic_code,
      submitted_at = EXCLUDED.submitted_at,
      updated_at   = EXCLUDED.updated_at;

-- Step 2: Delete the stale rows that used patients.patient_id as the key
DELETE FROM patient_medical_forms pmf
USING patients p
WHERE p.patient_id = pmf.patient_id::text
  AND pmf.patient_id <> p.id;

-- Verify: all remaining rows should match patients.id
SELECT pmf.patient_id, p.id AS real_id,
       CASE WHEN pmf.patient_id = p.id THEN 'OK' ELSE 'MISMATCH' END AS status
FROM patient_medical_forms pmf
JOIN patients p ON p.id = pmf.patient_id OR p.patient_id = pmf.patient_id::text;
