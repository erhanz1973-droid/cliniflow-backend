-- Manually suspend zlatan clinic
UPDATE clinics 
SET status = 'SUSPENDED', updated_at = NOW()
WHERE id = '0c4358c9-e102-4b76-b649-f595319d9d23';

-- Verify the update
SELECT id, name, status, updated_at 
FROM clinics 
WHERE id = '0c4358c9-e102-4b76-b649-f595319d9d23';
