-- 🔧 DOCTOR UNIQUE CONSTRAINT DÜZENLEMESI
-- Clinic-based unique constraints

-- 1️⃣ Mevcut email unique constraint'ini kaldır
-- Eğer varsa (constraint adı farklı olabilir)
DO $$
BEGIN
    -- Email constraint'ini kaldır
    ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_email_key;
    ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_email_unique;
    ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_email_unique_idx;
    
    -- Phone constraint'ini kaldır
    ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_phone_key;
    ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_phone_unique;
    ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_phone_unique_idx;
    
    RAISE NOTICE 'Mevcut unique constraintler kaldırıldı';
END $$;

-- 2️⃣ Yeni composite unique index'ler ekle
CREATE UNIQUE INDEX IF NOT EXISTS doctors_clinic_email_unique 
ON doctors (clinic_id, email);

CREATE UNIQUE INDEX IF NOT EXISTS doctors_clinic_phone_unique 
ON doctors (clinic_id, phone);

-- 3️⃣ Sonuç kontrolü
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'doctors' 
    AND indexname LIKE '%clinic%unique%'
ORDER BY indexname;

RAISE NOTICE 'Clinic-based unique constraints oluşturuldu';
