-- Debug active doctors count
SELECT 
    COUNT(*) as total_doctors,
    COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_doctors,
    COUNT(CASE WHEN role = 'DOCTOR' THEN 1 END) as doctor_role,
    COUNT(CASE WHEN status = 'ACTIVE' AND role = 'DOCTOR' THEN 1 END) as active_doctors_with_role
FROM doctors;
