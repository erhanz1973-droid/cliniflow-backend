-- ============================================================
-- Migration: patients.treatments JSONB tooth diagnoses
--            → encounter_diagnoses table (single source of truth)
--
-- Run once in Supabase SQL Editor.
-- Safe to re-run: uses ON CONFLICT DO NOTHING + existence checks.
-- ============================================================

DO $$
DECLARE
  p            RECORD;
  tooth_item   JSONB;
  diag_item    JSONB;
  diag_arr     JSONB;
  enc_id       UUID;
  tooth_id     TEXT;
  icd_code     TEXT;
  icd_desc     TEXT;
  inserted     INTEGER := 0;
  skipped      INTEGER := 0;
  enc_created  INTEGER := 0;
BEGIN

  -- Loop over every patient that has teeth in patients.treatments JSONB
  FOR p IN
    SELECT id, treatments
    FROM   patients
    WHERE  treatments IS NOT NULL
      AND  jsonb_typeof(treatments) = 'object'
      AND  jsonb_array_length(COALESCE(treatments->'teeth', '[]'::jsonb)) > 0
  LOOP

    -- 1. Find the oldest encounter for this patient (prefer admin_entry or admin_migration)
    SELECT id INTO enc_id
    FROM   patient_encounters
    WHERE  patient_id = p.id
    ORDER  BY created_at ASC
    LIMIT  1;

    -- 2. If no encounter exists, create a migration-only encounter
    IF enc_id IS NULL THEN
      INSERT INTO patient_encounters (patient_id, encounter_type, status, created_at, updated_at)
      VALUES (p.id, 'admin_migration', 'completed', NOW(), NOW())
      RETURNING id INTO enc_id;

      enc_created := enc_created + 1;
      RAISE NOTICE 'Created migration encounter % for patient %', enc_id, p.id;
    END IF;

    -- 3. Process each tooth
    FOR tooth_item IN
      SELECT value FROM jsonb_array_elements(p.treatments->'teeth')
    LOOP
      tooth_id := TRIM(COALESCE(tooth_item->>'toothId', tooth_item->>'tooth_id', ''));
      IF tooth_id = '' THEN CONTINUE; END IF;

      -- Merge tooth.diagnosis and tooth.diagnoses arrays
      diag_arr := COALESCE(tooth_item->'diagnosis', '[]'::jsonb);
      IF jsonb_typeof(COALESCE(tooth_item->'diagnoses', 'null'::jsonb)) = 'array' THEN
        diag_arr := diag_arr || (tooth_item->'diagnoses');
      END IF;

      FOR diag_item IN SELECT value FROM jsonb_array_elements(diag_arr) LOOP

        -- Support multiple field name conventions
        icd_code := TRIM(COALESCE(
          diag_item->>'icd10_code',
          diag_item->>'code',
          ''
        ));
        icd_desc := TRIM(COALESCE(
          diag_item->>'icd10_description',
          diag_item->>'description',
          diag_item->>'title',
          diag_item->>'name',
          ''
        ));

        -- Skip if both are empty
        IF icd_code = '' AND icd_desc = '' THEN
          skipped := skipped + 1;
          CONTINUE;
        END IF;

        -- Skip if already in encounter_diagnoses (same encounter + tooth + code/desc)
        IF EXISTS (
          SELECT 1 FROM encounter_diagnoses
          WHERE  encounter_id = enc_id
            AND  tooth_number::text = tooth_id
            AND  (
              (icd_code  <> '' AND icd10_code = icd_code)
              OR
              (icd_desc  <> '' AND icd10_description = icd_desc)
            )
        ) THEN
          skipped := skipped + 1;
          CONTINUE;
        END IF;

        -- Insert
        INSERT INTO encounter_diagnoses (
          encounter_id,
          icd10_code,
          icd10_description,
          tooth_number,
          is_primary,
          created_at,
          updated_at
        ) VALUES (
          enc_id,
          NULLIF(icd_code, ''),
          NULLIF(icd_desc, ''),
          tooth_id,          -- stored as text (matches runtime behaviour)
          TRUE,
          NOW(),
          NOW()
        );

        inserted := inserted + 1;

      END LOOP; -- diagnoses
    END LOOP; -- teeth
  END LOOP; -- patients

  RAISE NOTICE '=== Migration complete ===';
  RAISE NOTICE 'Encounters created : %', enc_created;
  RAISE NOTICE 'Diagnoses inserted : %', inserted;
  RAISE NOTICE 'Rows skipped       : %', skipped;

END $$;

-- ============================================================
-- Verification query – run after migration to confirm results
-- ============================================================
-- SELECT
--   p.id           AS patient_id,
--   p.name,
--   COUNT(ed.id)   AS diagnoses_migrated
-- FROM patients p
-- JOIN patient_encounters pe ON pe.patient_id = p.id
-- JOIN encounter_diagnoses ed ON ed.encounter_id = pe.id
-- GROUP BY p.id, p.name
-- ORDER BY diagnoses_migrated DESC
-- LIMIT 30;
