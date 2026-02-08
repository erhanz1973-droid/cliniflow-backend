-- Update DH17 patient status to APPROVED
UPDATE patients 
SET status = 'APPROVED', updated_at = NOW()
WHERE patient_id = 'DP83' AND role = 'PATIENT';

-- Also update original DH17 if exists
UPDATE patients 
SET status = 'APPROVED', updated_at = NOW()
WHERE patient_id = 'DH17' AND role = 'PATIENT';
