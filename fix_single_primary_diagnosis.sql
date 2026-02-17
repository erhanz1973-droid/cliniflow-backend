-- STEP 1: Clean existing bad data before adding constraint
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY encounter_id
           ORDER BY created_at DESC
         ) as rn
  FROM encounter_diagnoses
  WHERE is_primary = true
)
UPDATE encounter_diagnoses
SET is_primary = false
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1
);

-- STEP 2: Create partial unique index for single primary diagnosis
CREATE UNIQUE INDEX one_primary_per_encounter
ON encounter_diagnoses(encounter_id)
WHERE is_primary = true;

-- STEP 3: Verify the constraint works
-- This should fail if we try to insert duplicate primary diagnoses
SELECT 
  encounter_id, 
  COUNT(*) as primary_count,
  STRING_AGG(icd10_code, ', ') as primary_codes
FROM encounter_diagnoses 
WHERE is_primary = true 
GROUP BY encounter_id 
HAVING COUNT(*) > 1;
