-- Safe migration that handles existing data
-- Step 1: First, identify and fix any invalid status values
UPDATE patients 
SET status = CASE 
  WHEN status IS NULL OR status = '' THEN 'PENDING'
  WHEN status NOT IN ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED') THEN 'PENDING'
  ELSE status
END;

-- Step 2: Drop the old constraint (this should work now)
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_status_check;

-- Step 3: Add the new constraint
ALTER TABLE patients ADD CONSTRAINT patients_status_check 
  CHECK (status IN ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'));

-- Step 4: Verify everything is working
SELECT status, COUNT(*) as patient_count 
FROM patients 
GROUP BY status 
ORDER BY status;
