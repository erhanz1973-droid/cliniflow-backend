-- Update DK59 patient status to APPROVED
UPDATE patients 
SET status = 'APPROVED', updated_at = NOW()
WHERE patient_id = 'DP37' AND role = 'PATIENT';

-- Also update original DK59 if exists
UPDATE patients 
SET status = 'APPROVED', updated_at = NOW()
WHERE patient_id = 'DK59' AND role = 'PATIENT';
