-- Debug doctors data
SELECT 
    id,
    name,
    full_name,
    role,
    status,
    clinic_id,
    department,
    created_at
FROM doctors 
LIMIT 10;
