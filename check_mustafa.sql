-- Check Mustafa's role in the database
SELECT 
  patient_id,
  name,
  email,
  phone,
  role,
  status,
  created_at
FROM patients 
WHERE name ILIKE '%mustafa%' 
   OR email ILIKE '%mustafa%'
   OR phone ILIKE '%mustafa%'
   OR patient_id = 'p_d5437db28a11';
