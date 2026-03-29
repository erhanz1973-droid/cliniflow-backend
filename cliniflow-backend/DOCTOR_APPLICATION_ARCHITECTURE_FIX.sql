-- DOCTOR APPLICATION ARCHITECTURE FIX
-- Bu migration mevcut sistemi doğru mimariye taşıyor

-- 1️⃣ users tablosunu oluştur (eğer yoksa)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR UNIQUE NOT NULL,
    phone VARCHAR,
    password_hash VARCHAR, -- sadece backend auth varsa
    role VARCHAR NOT NULL CHECK (role IN ('PATIENT', 'DOCTOR', 'ADMIN')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2️⃣ doctor_applications tablosunu oluştur
CREATE TABLE IF NOT EXISTS doctor_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clinic_name VARCHAR NOT NULL,
    specialty VARCHAR,
    license_number VARCHAR,
    status VARCHAR NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE
);

-- 3️⃣ Mevcut doktorları users tablosuna taşı
INSERT INTO users (id, email, phone, role, created_at, updated_at)
SELECT 
    gen_random_uuid() as id,  -- Yeni UUID oluştur
    email,
    phone,
    'DOCTOR' as role,
    created_at,
    updated_at
FROM doctors 
WHERE email IS NOT NULL 
ON CONFLICT (email) DO NOTHING;

-- 4️⃣ Mevcut doktorları doctor_applications'a taşı (sadece PENDING olanlar)
INSERT INTO doctor_applications (id, user_id, clinic_name, specialty, license_number, status, created_at)
SELECT 
    gen_random_uuid() as id,
    u.id as user_id,
    d.clinic_id::text as clinic_name,  -- UUID'yi text'e çevir
    d.department as specialty,
    d.license_number,
    'PENDING' as status,
    d.created_at,
    NULL as approved_at,
    NULL as rejected_at
FROM doctors d
JOIN users u ON u.email = d.email
WHERE d.status = 'PENDING'
ON CONFLICT DO NOTHING;

-- 5️⃣ Onaylı doktorlar için users.role güncelle
UPDATE users 
SET role = 'DOCTOR', updated_at = NOW()
WHERE email IN (
    SELECT DISTINCT email 
    FROM doctors 
    WHERE status = 'APPROVED' 
    AND email IS NOT NULL
);

-- 6️⃣ Index'ler
CREATE INDEX IF NOT EXISTS idx_doctor_applications_user_id ON doctor_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_doctor_applications_status ON doctor_applications(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Migration log
DO $$
BEGIN
    RAISE NOTICE '=== DOCTOR APPLICATION ARCHITECTURE FIX ===';
    RAISE NOTICE '✅ users tablosu oluşturuldu';
    RAISE NOTICE '✅ doctor_applications tablosu oluşturuldu';
    RAISE NOTICE '✅ Mevcut doktorlar users tablosuna taşındı: %', 
        (SELECT COUNT(*) FROM doctors WHERE email IS NOT NULL);
    RAISE NOTICE '✅ Bekleyen başvurular doctor_applications'a taşındı: %',
        (SELECT COUNT(*) FROM doctor_applications);
    RAISE NOTICE '🎯 Mimari düzeltme tamamlandı!';
END $$;
