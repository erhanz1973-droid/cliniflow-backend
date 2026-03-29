-- Migration: Refactor treatments table for dental model

-- 1. Create procedures table if not exists
CREATE TABLE IF NOT EXISTS procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Add procedure_id and change tooth_number to integer in treatments table
ALTER TABLE encounter_treatments
    ADD COLUMN IF NOT EXISTS procedure_id UUID REFERENCES procedures(id),
    ALTER COLUMN tooth_number TYPE INTEGER USING tooth_number::integer;

-- 3. (Optional) Remove procedure_name column if exists
-- ALTER TABLE encounter_treatments DROP COLUMN IF EXISTS procedure_name;

-- 4. Add index for faster lookup
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_procedure_id ON encounter_treatments(procedure_id);

-- 5. Example procedures
INSERT INTO procedures (name, category) VALUES
    ('Implant', 'Surgery'),
    ('Crown', 'Restoration'),
    ('Filling', 'Restoration'),
    ('Root Canal', 'Endodontics'),
    ('Extraction', 'Surgery')
ON CONFLICT DO NOTHING;
