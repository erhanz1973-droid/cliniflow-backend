-- Create diagnosis_procedure_suggestions table
CREATE TABLE IF NOT EXISTS diagnosis_procedure_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icd10_code TEXT NOT NULL,
    procedure_name TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_diagnosis_procedure_suggestions_icd10_code ON diagnosis_procedure_suggestions(icd10_code);
CREATE INDEX IF NOT EXISTS idx_diagnosis_procedure_suggestions_priority ON diagnosis_procedure_suggestions(priority);

-- Add unique constraint to prevent duplicates
ALTER TABLE diagnosis_procedure_suggestions 
ADD CONSTRAINT unique_diagnosis_procedure UNIQUE (icd10_code, procedure_name);

-- Grant permissions
GRANT ALL ON diagnosis_procedure_suggestions TO authenticated;
GRANT ALL ON diagnosis_procedure_suggestions TO anon;

-- Insert sample data for common dental procedures
INSERT INTO diagnosis_procedure_suggestions (icd10_code, procedure_name, priority) VALUES
-- Dental Caries (K02)
('K02.9', 'Kompozit Dolgu', 1),
('K02.9', 'Amalgam Dolgu', 2),
('K02.9', 'Kanal Tedavisi', 3),

-- Pulpitis (K04)
('K04.0', 'Kanal Tedavisi', 1),
('K04.0', 'Apikal Rezeksiyon', 2),

-- Periodontal Diseases (K05)
('K05.3', 'Diş Taşı Temizliği', 1),
('K05.3', 'Küretaj', 2),
('K05.3', 'Kanama Tedavisi', 3),

-- Tooth Fractures (S02)
('S02.5', 'Kanal Tedavisi', 1),
('S02.5', 'Ekstraksiyon', 2),

-- Missing Teeth (K01)
('K01.1', 'İmplant', 1),
('K01.1', 'Köprü Protez', 2),
('K01.1', 'Hareketli Protez', 3),

-- Other common procedures
('K03.6', 'Diş Beyazlatma', 1),
('K03.6', 'Porselen Kaplama', 2),
('K03.6', 'Zirkonyum Kaplama', 3);
