-- Update doctor status to ACTIVE
UPDATE patients 
SET status = 'ACTIVE', updated_at = NOW()
WHERE patient_id = 'DT17' AND role = 'DOCTOR';
