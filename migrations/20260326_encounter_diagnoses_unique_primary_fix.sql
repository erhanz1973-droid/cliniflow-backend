-- Fix: old UNIQUE (encounter_id, is_primary) allows at most one row with is_primary = false
-- per encounter, so only 2 diagnoses total — breaks normal clinical use.
-- Replace with partial unique index: at most one primary (true) per encounter.

ALTER TABLE encounter_diagnoses
  DROP CONSTRAINT IF EXISTS unique_primary_diagnosis_per_encounter;

-- Required before CREATE UNIQUE INDEX: existing data may have multiple is_primary = true per encounter.
-- Keep one primary per encounter (newest created_at, then id); demote the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY encounter_id
           ORDER BY created_at DESC NULLS LAST, id ASC
         ) AS rn
  FROM encounter_diagnoses
  WHERE is_primary = true
)
UPDATE encounter_diagnoses ed
SET is_primary = false
FROM ranked r
WHERE ed.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS idx_encounter_diagnoses_one_primary_true;

CREATE UNIQUE INDEX idx_encounter_diagnoses_one_primary_true
  ON encounter_diagnoses (encounter_id)
  WHERE is_primary = true;
