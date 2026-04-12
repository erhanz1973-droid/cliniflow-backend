-- Migration: patients.health (JSONB) → patient_health_forms (single source of truth)
--
-- Run this once in Supabase SQL Editor.
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING (no duplicate writes).
--
-- Step 1: Ensure patient_health_forms has the correct schema
-- (Run only if the table was created with bigint timestamps instead of timestamptz)
DO $$
BEGIN
  -- Add updated_at as timestamptz if it doesn't exist or is wrong type
  -- (Skip if already correct)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patient_health_forms' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE patient_health_forms ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patient_health_forms' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE patient_health_forms ADD COLUMN created_at timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patient_health_forms' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE patient_health_forms ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- Step 2: Ensure form_data is JSONB (not text)
-- If it's text, cast it (safe no-op if already jsonb)
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'patient_health_forms' AND column_name = 'form_data';

  IF col_type = 'text' THEN
    -- Convert text → jsonb, setting invalid rows to '{}'
    ALTER TABLE patient_health_forms
      ALTER COLUMN form_data TYPE jsonb
      USING (
        CASE
          WHEN form_data IS NULL OR form_data = '' THEN '{}'::jsonb
          ELSE form_data::jsonb
        END
      );
    RAISE NOTICE 'Converted form_data column from text to jsonb';
  ELSE
    RAISE NOTICE 'form_data is already %, no conversion needed', col_type;
  END IF;
END $$;

-- Step 3: Migrate patients.health JSONB → patient_health_forms
-- Only copies rows where a patient_health_forms record does NOT yet exist
INSERT INTO patient_health_forms (patient_id, clinic_code, form_data, is_complete, completed_at, created_at, updated_at)
SELECT
  p.id                                                           AS patient_id,
  p.clinic_code                                                  AS clinic_code,
  COALESCE(
    (p.health->>'formData')::jsonb,
    p.health - 'isComplete' - 'completedAt' - 'createdAt' - 'updatedAt' - 'patientId'
  )                                                              AS form_data,
  COALESCE((p.health->>'isComplete')::boolean, false)           AS is_complete,
  CASE
    WHEN (p.health->>'completedAt') ~ '^\d+$'
    THEN to_timestamp((p.health->>'completedAt')::bigint / 1000.0)
    ELSE (p.health->>'completedAt')::timestamptz
  END                                                            AS completed_at,
  COALESCE(
    CASE
      WHEN (p.health->>'createdAt') ~ '^\d+$'
      THEN to_timestamp((p.health->>'createdAt')::bigint / 1000.0)
      ELSE (p.health->>'createdAt')::timestamptz
    END,
    p.updated_at,
    now()
  )                                                              AS created_at,
  COALESCE(p.updated_at, now())                                  AS updated_at
FROM patients p
WHERE
  -- Only migrate patients who have health data
  p.health IS NOT NULL
  AND p.health != 'null'::jsonb
  AND p.health != '{}'::jsonb
  -- Skip patients who already have a record in patient_health_forms
  AND NOT EXISTS (
    SELECT 1 FROM patient_health_forms hf WHERE hf.patient_id = p.id
  );

-- Report results
DO $$
DECLARE
  migrated_count int;
  total_with_health int;
BEGIN
  SELECT COUNT(*) INTO total_with_health
  FROM patients
  WHERE health IS NOT NULL AND health != 'null'::jsonb AND health != '{}'::jsonb;

  SELECT COUNT(*) INTO migrated_count
  FROM patient_health_forms;

  RAISE NOTICE 'Migration complete. patients with health data: %, total patient_health_forms rows: %',
    total_with_health, migrated_count;
END $$;
