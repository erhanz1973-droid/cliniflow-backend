-- Doctor ID Migration Script - Safe Version
-- Handle existing auth users properly

-- 1️⃣ Check current situation
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
    END as id_status,
    CASE 
        WHEN au.id IS NOT NULL THEN 'HAS_AUTH_USER'
        ELSE 'NO_AUTH_USER'
    END as auth_status
FROM doctors d
LEFT JOIN auth.users au ON d.email = au.email
ORDER BY auth_status, id_status, d.full_name;

-- 2️⃣ Update doctors with existing auth users (safe update)
UPDATE doctors
SET id = au.id
FROM auth.users au
WHERE doctors.email = au.email
AND doctors.id != au.id;

-- 3️⃣ Check results of existing auth user mapping
SELECT 
    d.id as doctor_id,
    d.full_name,
    d.email,
    au.id as auth_user_id,
    au.email as auth_email,
    CASE 
        WHEN d.id = au.id THEN 'MATCHED'
        ELSE 'NOT_MATCHED'
    END as status
FROM doctors d
LEFT JOIN auth.users au ON d.id = au.id
WHERE au.id IS NOT NULL
ORDER BY d.full_name;

-- 4️⃣ Create auth users only for doctors without any auth user
INSERT INTO auth.users (
    id,
    email,
    created_at,
    updated_at,
    raw_user_meta_data,
    email_confirmed_at
)
SELECT 
    d.id, -- Use existing doctor ID
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
    WHERE au.email = d.email 
    OR au.email = d.phone || '@cliniflow.app'
);

-- 5️⃣ Final verification
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
        WHEN EXISTS (SELECT 1 FROM treatment_group_members tgm WHERE tgm.doctor_id = d.id) THEN 'HAS_ASSIGNMENTS'
        ELSE 'NO_ASSIGNMENTS'
    END as assignment_status
FROM doctors d
ORDER BY auth_status, d.full_name;
