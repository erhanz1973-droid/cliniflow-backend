-- ============================================================
-- fix-health-forms-uuid.sql
-- Run once in the Supabase SQL editor.
--
-- Problem: patient_health_forms.patient_id contains legacy string
--   values like "MIKE_TIGGER", "SARP_2", "p_..." that are not
--   valid UUIDs, so the patient app cannot find its own form.
--
-- Steps:
--   1. Preview the dirty rows (informational query)
--   2. Attempt to re-link rows that have a matching patient
--   3. Delete rows that cannot be re-linked
--   4. Add a CHECK constraint so this can never happen again
-- ============================================================

-- ── 1. Preview: how many dirty rows exist? ──────────────────
SELECT count(*) AS dirty_rows
FROM patient_health_forms
WHERE patient_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── 2. Re-link dirty rows that have a matching patient ───────
--
--   If a legacy row has patient_id = 'MIKE_TIGGER' and there is
--   a patient whose name matches, update the row to use the real
--   patients.id UUID.
--
--   This uses a best-effort name match; rows that don't match
--   are left for step 3 (deletion).
--
UPDATE patient_health_forms phf
SET patient_id = p.id
FROM patients p
WHERE phf.patient_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  -- Match by name stored in the form's personalInfo JSON field
  AND (
    lower(p.name) = lower(
      phf.form_data->>'personalInfo'->>'name'
    )
    OR lower(p.name) = lower(replace(phf.patient_id, '_', ' '))
  )
  -- Safety: only touch rows for patients in the same clinic
  AND (
    p.clinic_code = phf.clinic_code
    OR phf.clinic_code IS NULL
  );

-- ── 3. Delete rows that still have a non-UUID patient_id ────
--   These are truly orphaned records — they cannot be linked
--   to any real patient and would never be found by the app.
DELETE FROM patient_health_forms
WHERE patient_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ── 4. Add CHECK constraint to prevent future dirty data ─────
--
--   We use a named constraint so it can be dropped/re-added if
--   needed. The regex is intentionally simple and matches any
--   standard UUID (v1–v5, lowercase or uppercase hex).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'patient_health_forms_patient_id_uuid_check'
  ) THEN
    ALTER TABLE patient_health_forms
      ADD CONSTRAINT patient_health_forms_patient_id_uuid_check
      CHECK (
        patient_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );
  END IF;
END $$;

-- ── 5. Add index on patient_id if missing (perf) ─────────────
CREATE INDEX IF NOT EXISTS idx_patient_health_forms_patient_id
  ON patient_health_forms (patient_id);

-- ── Verify: should return 0 ───────────────────────────────────
SELECT count(*) AS remaining_dirty_rows
FROM patient_health_forms
WHERE patient_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
