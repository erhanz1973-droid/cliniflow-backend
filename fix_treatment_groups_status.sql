-- Fix treatment_groups status constraint
-- Normalize old ACTIVE/COMPLETED values to new lifecycle OPEN/IN_PROGRESS/COMPLETED/CANCELLED

-- 1️⃣ Mevcut constraint'i kaldır
ALTER TABLE treatment_groups
DROP CONSTRAINT IF EXISTS tg_status_check;

-- 2️⃣ Eski veriyi normalize et
UPDATE treatment_groups
SET status = 'OPEN'
WHERE status = 'ACTIVE';

-- 3️⃣ Kontrol et
-- SELECT status, COUNT(*)
-- FROM treatment_groups
-- GROUP BY status
-- ORDER BY status;

-- 4️⃣ Yeni lifecycle constraint'i ekle
ALTER TABLE treatment_groups
ADD CONSTRAINT tg_status_check
CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED'));

-- 5️⃣ Son kontrol
-- SELECT status, COUNT(*)
-- FROM treatment_groups
-- GROUP BY status
-- ORDER BY status;
