-- encounter_diagnoses: 1970-01-01 (epoch) görünümü — tablo varsayılanı + eski satırlar
-- Supabase SQL Editor'da çalıştırın. (save_diagnoses_atomic tam gövdesi ortamınıza göre değişebilir;
-- Node API doğrudan INSERT yolunda zaten created_at gönderiyor.)

-- 1) Yeni satırlar için güvenli varsayılan
ALTER TABLE encounter_diagnoses
  ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'utc');

-- 2) Bozuk (çok eski) created_at değerlerini düzelt
UPDATE encounter_diagnoses
SET created_at = NOW()
WHERE created_at IS NOT NULL
  AND created_at < TIMESTAMPTZ '1980-01-01';

-- 3) RPC kullanıyorsanız: INSERT listesine `created_at` ekleyin, örnek:
--    INSERT INTO encounter_diagnoses (..., created_at)
--    SELECT ..., NOW()
-- Repodaki tam örnek: save_diagnoses_atomic_procedure.sql (INSERT bloğuna created_at NOW()).
