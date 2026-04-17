-- Doctor app: encounter_treatments satırları procedure_type ile oluşur; procedures tablosunda satır olmayabilir.
-- FK kaldırılmazsa POST /api/doctor/encounters/:id/treatments 23503 verir.
-- procedure_id NOT NULL ise aynı migration'da NULL yapın (veya uygulama tarafında gerçek procedures.id zorunlu tutun).

ALTER TABLE encounter_treatments DROP CONSTRAINT IF EXISTS fk_encounter_treatments_procedure;
ALTER TABLE encounter_treatments DROP CONSTRAINT IF EXISTS encounter_treatments_procedure_id_fkey;

DO $$
BEGIN
  ALTER TABLE encounter_treatments ALTER COLUMN procedure_id DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN
    RAISE NOTICE 'procedure_id column missing — skipped DROP NOT NULL';
  WHEN others THEN
    RAISE NOTICE 'procedure_id DROP NOT NULL skipped: %', SQLERRM;
END $$;
