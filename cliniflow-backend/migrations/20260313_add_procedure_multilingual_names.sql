-- Migration: Add multilingual procedure name fields
ALTER TABLE diagnosis_procedure_suggestions
    ADD COLUMN procedure_name_en TEXT,
    ADD COLUMN procedure_name_tr TEXT,
    ADD COLUMN procedure_name_ru TEXT,
    ADD COLUMN procedure_name_ka TEXT;

-- Optional: Copy existing procedure_name to procedure_name_en for backward compatibility
UPDATE diagnosis_procedure_suggestions
    SET procedure_name_en = procedure_name
    WHERE procedure_name_en IS NULL;

-- (You may later remove the old procedure_name field if not needed)
