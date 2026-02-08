-- Step 1: Check current status values
SELECT DISTINCT status, COUNT(*) as count 
FROM patients 
GROUP BY status;

-- Step 2: Update invalid status values to PENDING
UPDATE patients 
SET status = 'PENDING' 
WHERE status NOT IN ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- Step 3: Drop existing constraint
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_status_check;

-- Step 4: Add new constraint with all valid statuses
ALTER TABLE patients ADD CONSTRAINT patients_status_check 
  CHECK (status IN ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'));

-- Step 5: Verify the constraint works
SELECT DISTINCT status, COUNT(*) as count 
FROM patients 
GROUP BY status;
