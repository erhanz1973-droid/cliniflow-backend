-- Add tooth_number column to encounter_diagnoses table if it doesn't exist
DO $$
BEGIN
    -- Check if the column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='encounter_diagnoses' 
        AND column_name='tooth_number'
    ) THEN
        ALTER TABLE encounter_diagnoses 
        ADD COLUMN tooth_number TEXT;
        
        RAISE NOTICE 'Added tooth_number column to encounter_diagnoses table';
    ELSE
        RAISE NOTICE 'tooth_number column already exists in encounter_diagnoses table';
    END IF;
END $$;
