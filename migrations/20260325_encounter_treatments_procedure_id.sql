-- encounter_treatments.procedure_id — bazı ortamlarda NOT NULL (mobil API procedure_type ile doldurur)
-- İsteğe bağlı: kolon yoksa ekle; boş satırları procedure_type ile doldur

ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS procedure_id TEXT;

UPDATE encounter_treatments
SET procedure_id = COALESCE(NULLIF(trim(procedure_id), ''), procedure_type)
WHERE procedure_id IS NULL AND procedure_type IS NOT NULL;
