-- encounter_treatments — doktor uygulaması: tanı → tedavi
-- Backend: GET/POST /api/doctor/encounters/:id/treatments
-- Supabase SQL Editor'da bir kez çalıştırın. Güvenli tekrar: ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS

-- 1) Tablo yoksa oluştur (güncel şema)
CREATE TABLE IF NOT EXISTS encounter_treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL,
  tooth_number INTEGER NOT NULL,
  procedure_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_by_doctor_id UUID NOT NULL,
  assigned_doctor_id UUID,
  chair TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT encounter_treatments_tooth_fdi CHECK (tooth_number >= 11 AND tooth_number <= 48)
);

-- 2) Eski kurulumdan kalan tabloya eksik kolonları ekle
ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS procedure_type TEXT;
ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID;
ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS chair TEXT;
ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS created_by_doctor_id UUID;
ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE encounter_treatments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- tooth_number bazı ortamlarda TEXT olabilir — INTEGER’a çevir (veri uygunsa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'encounter_treatments'
      AND column_name = 'tooth_number' AND data_type = 'text'
  ) THEN
    ALTER TABLE encounter_treatments
      ALTER COLUMN tooth_number TYPE INTEGER USING (trim(tooth_number)::integer);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'tooth_number tip dönüşümü atlandı (manuel kontrol gerekebilir): %', SQLERRM;
END $$;

-- procedure_name eski şemada NOT NULL ise yeni satırlar için engel olmasın
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'encounter_treatments'
      AND column_name = 'procedure_name' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE encounter_treatments ALTER COLUMN procedure_name DROP NOT NULL;
  END IF;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Eski satırlarda procedure_type boşsa geçici değer (NOT NULL öncesi)
UPDATE encounter_treatments SET procedure_type = 'FILLING' WHERE procedure_type IS NULL;

-- procedure_type zorunlu olsun (yeni satırlar API’den gelir)
DO $$
BEGIN
  ALTER TABLE encounter_treatments ALTER COLUMN procedure_type SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'procedure_type NOT NULL ayarı atlandı: %', SQLERRM;
END $$;

-- 3) Foreign key’ler (yoksa ekle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'encounter_treatments_encounter_id_fkey'
  ) THEN
    ALTER TABLE encounter_treatments
      ADD CONSTRAINT encounter_treatments_encounter_id_fkey
      FOREIGN KEY (encounter_id) REFERENCES patient_encounters(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'patient_encounters tablosu yok — FK atlandı';
  WHEN invalid_foreign_key THEN
    RAISE NOTICE 'encounter_id FK eklenemedi (veri/şema): %', SQLERRM;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'encounter_treatments_created_by_doctor_fkey'
  ) THEN
    ALTER TABLE encounter_treatments
      ADD CONSTRAINT encounter_treatments_created_by_doctor_fkey
      FOREIGN KEY (created_by_doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN
    RAISE NOTICE 'doctors tablosu yok — FK atlandı';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'encounter_treatments_assigned_doctor_fkey'
  ) THEN
    ALTER TABLE encounter_treatments
      ADD CONSTRAINT encounter_treatments_assigned_doctor_fkey
      FOREIGN KEY (assigned_doctor_id) REFERENCES doctors(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

-- 4) İndeksler
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_encounter_id
  ON encounter_treatments (encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_procedure_type
  ON encounter_treatments (procedure_type);

-- 5) Eski prosedür FK’sini kaldır (varsa) — migrations/001_add_procedure_type.sql ile uyumlu
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'encounter_treatments'
      AND constraint_name = 'encounter_treatments_procedure_id_fkey'
  ) THEN
    ALTER TABLE encounter_treatments DROP CONSTRAINT encounter_treatments_procedure_id_fkey;
  END IF;
END $$;
