-- Role Separation Fix Script
-- Ensure DOCTOR role users are in doctors table, not patients table

-- 1️⃣ Check current role separation issues
SELECT 
    'patients_with_doctor_role' as issue_type,
    COUNT(*) as count
FROM patients 
WHERE role = 'DOCTOR'

UNION ALL

SELECT 
    'doctors_with_patient_role' as issue_type,
    COUNT(*) as count
FROM doctors 
WHERE role = 'PATIENT'

UNION ALL

SELECT 
    'doctors_missing_auth_users' as issue_type,
    COUNT(*) as count
FROM doctors d
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = d.id)

UNION ALL

SELECT 
    'patients_missing_auth_users' as issue_type,
    COUNT(*) as count
FROM patients p
WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p.id);

-- 2️⃣ Show problematic records
SELECT 
    p.id,
    p.name,
    p.email,
    p.phone,
    p.role as patient_role,
    p.status as patient_status,
    d.id as doctor_id,
    d.full_name,
    d.role as doctor_role,
    d.status as doctor_status,
    CASE 
        WHEN p.role = 'DOCTOR' AND d.id IS NULL THEN 'DOCTOR_IN_PATIENTS_TABLE'
        WHEN p.role = 'DOCTOR' AND d.id IS NOT NULL THEN 'DOCTOR_IN_BOTH_TABLES'
        WHEN p.role = 'PATIENT' AND d.id IS NOT NULL THEN 'PATIENT_IN_DOCTORS_TABLE'
        ELSE 'OK'
    END as issue_type
FROM patients p
LEFT JOIN doctors d ON p.id = d.id
WHERE p.role = 'DOCTOR' OR d.id IS NOT NULL
ORDER BY issue_type, p.name;

-- 3️⃣ Move DOCTOR role users from patients to doctors table
INSERT INTO doctors (
    id,
    doctor_id,
    clinic_id,
    clinic_code,
    full_name,
    email,
    phone,
    license_number,
    department,
    specialties,
    status,
    role,
    created_at,
    updated_at
)
SELECT 
    p.id,
    'd_' || EXTRACT(EPOCH FROM NOW())::text || '_' || substr(md5(p.id::text), 1, 6),
    p.clinic_id,
    p.clinic_code,
    p.name,
    p.email,
    p.phone,
    p.license_number,
    p.department,
    p.specialties,
    'PENDING', -- Default status for migrated doctors
    'DOCTOR',
    p.created_at,
    NOW()
FROM patients p
WHERE p.role = 'DOCTOR'
AND NOT EXISTS (SELECT 1 FROM doctors d WHERE d.id = p.id);

-- 4️⃣ Remove DOCTOR role users from patients table
DELETE FROM patients 
WHERE role = 'DOCTOR'
AND EXISTS (SELECT 1 FROM doctors d WHERE d.id = patients.id);

-- 5️⃣ Remove PATIENT role users from doctors table
DELETE FROM doctors 
WHERE role = 'PATIENT'
AND EXISTS (SELECT 1 FROM patients p WHERE p.id = doctors.id);

-- 6️⃣ Create auth users for doctors without them
INSERT INTO auth.users (
    id,
    email,
    created_at,
    updated_at,
    raw_user_meta_data,
    email_confirmed_at
)
SELECT 
    d.id,
    COALESCE(d.email, d.phone || '@cliniflow.app'),
    NOW(),
    NOW(),
    jsonb_build_object(
        'name', d.full_name,
        'role', 'DOCTOR',
        'phone', d.phone
    ),
    NOW()
FROM doctors d
WHERE d.email IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM auth.users au 
    WHERE au.id = d.id 
    OR au.email = d.email 
    OR au.email = d.phone || '@cliniflow.app'
);

-- 7️⃣ Final verification
SELECT 
    'doctors_table' as table_name,
    COUNT(*) as total_count,
    COUNT(CASE WHEN role = 'DOCTOR' THEN 1 END) as doctor_count,
    COUNT(CASE WHEN role = 'PATIENT' THEN 1 END) as patient_count,
    COUNT(CASE WHEN EXISTS (SELECT 1 FROM auth.users au WHERE au.id = doctors.id) THEN 1 END) as has_auth_user
FROM doctors

UNION ALL

SELECT 
    'patients_table' as table_name,
    COUNT(*) as total_count,
    COUNT(CASE WHEN role = 'DOCTOR' THEN 1 END) as doctor_count,
    COUNT(CASE WHEN role = 'PATIENT' THEN 1 END) as patient_count,
    COUNT(CASE WHEN EXISTS (SELECT 1 FROM auth.users au WHERE au.id = patients.id) THEN 1 END) as has_auth_user
FROM patients;
