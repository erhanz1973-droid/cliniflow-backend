-- ================== FIX PATIENTS STATUS CHECK CONSTRAINT ==================
-- This migration drops the existing status check constraint and recreates it properly

-- Drop existing check constraint if it exists
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_status_check;

-- Create proper check constraint for status column
ALTER TABLE patients 
ADD CONSTRAINT patients_status_check 
CHECK (status IN ('ACTIVE', 'PENDING', 'REJECTED', 'SUSPENDED'));

-- Verify the constraint was added
SELECT constraint_name, check_clause
FROM information_schema.check_constraints 
WHERE constraint_name = 'patients_status_check'
  AND table_name = 'patients';
