-- Doctor ID Migration Script
-- Fix foreign key violations by ensuring doctors.id = auth.users.id

-- 1️⃣ Check current doctor IDs vs auth users
SELECT 
    d.id as doctor_id,
    d.full_name,
    d.email,
    d.phone,
    au.id as auth_user_id,
    au.email as auth_email,
    CASE 
        WHEN d.id = au.id THEN 'MATCH'
        ELSE 'MISMATCH'
    END as id_status
FROM doctors d
LEFT JOIN auth.users au ON d.email = au.email
ORDER BY id_status, d.full_name;

-- 2️⃣ Create mapping table for doctors without auth users
CREATE TEMPORARY TABLE doctor_auth_mapping AS
SELECT 
    d.id as old_doctor_id,
    d.full_name,
    d.email,
    d.phone,
    gen_random_uuid() as new_auth_user_id
FROM doctors d
WHERE d.id NOT IN (SELECT id FROM auth.users WHERE users.email = d.email);

-- 3️⃣ Create auth users for doctors without them
INSERT INTO auth.users (
    id,
    email,
    created_at,
    updated_at,
    raw_user_meta_data,
    email_confirmed_at
)
SELECT 
    new_auth_user_id,
    COALESCE(email, phone || '@cliniflow.app'),
    NOW(),
    NOW(),
    jsonb_build_object(
        'name', full_name,
        'role', 'DOCTOR',
        'phone', phone
    ),
    NOW()
FROM doctor_auth_mapping
WHERE email IS NOT NULL OR phone IS NOT NULL;

-- 4️⃣ Update doctors table to use auth user IDs
UPDATE doctors
SET id = (
    SELECT au.id 
    FROM auth.users au 
    WHERE au.email = doctors.email
    LIMIT 1
)
WHERE id IN (
    SELECT old_doctor_id 
    FROM doctor_auth_mapping
);

-- 5️⃣ Update foreign key references in related tables
UPDATE treatment_group_doctors
SET doctor_id = (
    SELECT au.id 
    FROM auth.users au 
    WHERE au.email = (SELECT email FROM doctors d WHERE d.doctor_id = treatment_group_doctors.doctor_id LIMIT 1)
    LIMIT 1
)
WHERE doctor_id IN (
    SELECT old_doctor_id 
    FROM doctor_auth_mapping
);

-- 6️⃣ Update other foreign key references (if any)
UPDATE patient_encounters
SET created_by_doctor_id = (
    SELECT au.id 
    FROM auth.users au 
    WHERE au.email = (SELECT email FROM doctors d WHERE d.doctor_id = patient_encounters.created_by_doctor_id LIMIT 1)
    LIMIT 1
)
WHERE created_by_doctor_id IN (
    SELECT old_doctor_id 
    FROM doctor_auth_mapping
);

-- 7️⃣ Verify migration results
SELECT 
    d.id as doctor_id,
    d.full_name,
    d.email,
    d.phone,
    CASE 
        WHEN EXISTS (SELECT 1 FROM auth.users au WHERE au.id = d.id) THEN 'AUTH_USER_EXISTS'
        ELSE 'NO_AUTH_USER'
    END as auth_status,
    CASE 
        WHEN EXISTS (SELECT 1 FROM treatment_group_doctors tgd WHERE tgd.doctor_id = d.id) THEN 'HAS_ASSIGNMENTS'
        ELSE 'NO_ASSIGNMENTS'
    END as assignment_status
FROM doctors d
ORDER BY auth_status, d.full_name;

-- 8️⃣ Clean up temporary table
DROP TABLE IF EXISTS doctor_auth_mapping;
