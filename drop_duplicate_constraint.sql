-- Drop duplicate lowercase constraint
-- Keep uppercase constraint (tg_status_check) and remove lowercase (treatment_groups_status_check)

ALTER TABLE treatment_groups 
DROP CONSTRAINT IF EXISTS treatment_groups_status_check;

-- Verify constraint removal
SELECT 
    conname,
    contype,
    consrc
FROM pg_constraint 
WHERE conrelid = 'treatment_groups'::regclass 
AND contype = 'c'
ORDER BY conname;
