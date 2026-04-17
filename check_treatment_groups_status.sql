-- Check current treatment_groups status values
SELECT status, COUNT(*) 
FROM treatment_groups 
GROUP BY status 
ORDER BY status;
