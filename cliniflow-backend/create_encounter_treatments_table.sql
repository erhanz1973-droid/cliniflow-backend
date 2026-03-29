-- Create encounter_treatments table for treatment planning
CREATE TABLE IF NOT EXISTS encounter_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL,
    tooth_number TEXT NOT NULL,
    procedure_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned', 'done', 'cancelled')) DEFAULT 'planned',
    created_by_doctor_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_encounter_id ON encounter_treatments(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_tooth_number ON encounter_treatments(tooth_number);
CREATE INDEX IF NOT EXISTS idx_encounter_treatments_status ON encounter_treatments(status);

-- Add foreign key constraints if encounters table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'encounters') THEN
        ALTER TABLE encounter_treatments 
        ADD CONSTRAINT fk_encounter_treatments_encounter_id 
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add foreign key constraints if users table exists  
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE encounter_treatments 
        ADD CONSTRAINT fk_encounter_treatments_doctor_id 
        FOREIGN KEY (created_by_doctor_id) REFERENCES users(id);
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON encounter_treatments TO authenticated;
GRANT ALL ON encounter_treatments TO anon;
