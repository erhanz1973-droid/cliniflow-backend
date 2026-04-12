-- Auto-approve all pending doctors
-- Update existing PENDING doctors to ACTIVE status

UPDATE patients
SET status = 'ACTIVE'
WHERE role = 'DOCTOR'
AND status = 'PENDING';

-- Verify the update
SELECT 
    COUNT(*) as total_updated,
    role,
    status
FROM patients
WHERE role = 'DOCTOR'
GROUP BY role, status
ORDER BY status;
