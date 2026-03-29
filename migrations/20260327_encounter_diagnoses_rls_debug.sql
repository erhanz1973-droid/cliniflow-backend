-- encounter_diagnoses: RLS debug / permissive policies (Supabase SQL Editor)
--
-- Backend Node uses SUPABASE_SERVICE_ROLE_KEY — in Supabase this role typically
-- BYPASSES RLS. If inserts from the API still fail, prefer checking:
--   - SUPABASE_URL points at the correct project
--   - FK: encounter_id exists in patient_encounters, created_by_doctor_id in doctors
--
-- ---------------------------------------------------------------------------
-- STEP 1 — TEST ONLY (isolate RLS as cause). Run in SQL Editor, then retry insert.
-- Re-enable RLS after the test.
-- ---------------------------------------------------------------------------
-- ALTER TABLE encounter_diagnoses DISABLE ROW LEVEL SECURITY;
--
-- To turn RLS back on:
-- ALTER TABLE encounter_diagnoses ENABLE ROW LEVEL SECURITY;
--
-- ---------------------------------------------------------------------------
-- STEP 2 — Temporary permissive policies (tighten for production: scope by clinic/user)
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

ALTER TABLE encounter_diagnoses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert for all (temp)" ON encounter_diagnoses;
CREATE POLICY "Allow insert for all (temp)"
  ON encounter_diagnoses
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select for all (temp)" ON encounter_diagnoses;
CREATE POLICY "Allow select for all (temp)"
  ON encounter_diagnoses
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow update for all (temp)" ON encounter_diagnoses;
CREATE POLICY "Allow update for all (temp)"
  ON encounter_diagnoses
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete for all (temp)" ON encounter_diagnoses;
CREATE POLICY "Allow delete for all (temp)"
  ON encounter_diagnoses
  FOR DELETE
  USING (true);
