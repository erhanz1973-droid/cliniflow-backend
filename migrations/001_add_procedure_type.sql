-- Migration: Option C — drop procedures FK dependency from encounter_treatments
-- Date: 2026-03-10
--
-- 1. Add procedure_type TEXT column (canonical type code, e.g. CROWN, FILLING).
-- 2. Drop any FK constraint linking procedure_id → procedures.id.
-- The procedure_id column is left in place (nullable) to avoid breaking existing
-- rows, but new code no longer writes to it.

-- Add procedure_type TEXT column if not already present
ALTER TABLE encounter_treatments
  ADD COLUMN IF NOT EXISTS procedure_type TEXT;

-- Drop the FK constraint on procedure_id (name may vary by environment).
-- We try the two most common auto-generated names; both DO NOTHING if not found.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'encounter_treatments'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'encounter_treatments_procedure_id_fkey'
  ) THEN
    ALTER TABLE encounter_treatments
      DROP CONSTRAINT encounter_treatments_procedure_id_fkey;
  END IF;
END $$;

-- Index for price lookups by procedure_type
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_procedure_type
  ON encounter_treatments (procedure_type);
