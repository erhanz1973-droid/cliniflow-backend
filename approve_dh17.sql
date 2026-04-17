-- Update DH17 patient status to APPROVED
UPDATE patients 
SET status = 'APPROVED', updated_at = NOW()
WHERE patient_id = 'DH17' AND role = 'PATIENT';
