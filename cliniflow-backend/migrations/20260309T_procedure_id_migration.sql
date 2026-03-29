-- MIGRATION: Change encounter_treatments to use procedure_id (UUID) instead of procedure_name (TEXT)
-- 1. Add procedure_id column
ALTER TABLE encounter_treatments ADD COLUMN procedure_id UUID;

-- 2. Update procedure_id for existing rows (if possible, using name match)
UPDATE encounter_treatments et
SET procedure_id = p.id
FROM procedures p
WHERE et.procedure_name = p.name;

-- 3. Set procedure_id as NOT NULL (if all rows are migrated)
ALTER TABLE encounter_treatments ALTER COLUMN procedure_id SET NOT NULL;

-- 4. Add foreign key constraint
ALTER TABLE encounter_treatments
  ADD CONSTRAINT fk_encounter_treatments_procedure_id
  FOREIGN KEY (procedure_id) REFERENCES procedures(id);

-- 5. (Optional) Remove procedure_name column
ALTER TABLE encounter_treatments DROP COLUMN procedure_name;

-- 6. (Optional) Clean up invalid treatments (tooth_number = '00')
DELETE FROM encounter_treatments WHERE tooth_number = '00';
