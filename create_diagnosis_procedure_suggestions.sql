-- Create diagnosis_procedure_suggestions table
CREATE TABLE IF NOT EXISTS diagnosis_procedure_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icd10_code TEXT NOT NULL,
    procedure_name TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert common dental procedures for common ICD-10 codes
INSERT INTO diagnosis_procedure_suggestions (icd10_code, procedure_name, priority) VALUES
-- K02.1 - Dental caries
('K02.1', 'Kompozit Dolgu', 1),
('K02.1', 'Kanal Tedavisi', 2),
('K02.1', 'Çekim', 3),
('K02.1', 'Röntgen', 4),

-- K04 - Pulp and periapical conditions
('K04.0', 'Kanal Tedavisi', 1),
('K04.0', 'Kanal Üstü Dolgu', 2),
('K04.0', 'Çekim', 3),

-- K03 - Other diseases of hard tissues of teeth
('K03.6', 'Diş Taşı Temizliği', 1),
('K03.6', 'Diş Eti Tedavisi', 2),

-- K08 - Disorders of tooth development and eruption
('K08.1', 'Çekim', 1),
('K08.1', 'Implant', 2),
('K08.1', 'Köprü Protez', 3),

-- K05 - Gingivitis and periodontal diseases
('K05.3', 'Diş Taşı Temizliği', 1),
('K05.3', 'Diş Eti Tedavisi', 2),
('K05.3', 'Kanal Tedavisi', 3),

-- Common procedures for various conditions
('K02.0', 'Kompozit Dolgu', 1),
('K02.0', 'Amalgam Dolgu', 2),
('K02.0', 'Çekim', 3),
('K02.0', 'Röntgen', 4),

-- Orthodontic procedures
('07.2', 'Ortodontik Tedavi', 1),
('07.2', 'Diş Teli Takma', 2);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_diagnosis_procedure_suggestions_code ON diagnosis_procedure_suggestions(icd10_code);
CREATE INDEX IF NOT EXISTS idx_diagnosis_procedure_suggestions_priority ON diagnosis_procedure_suggestions(priority);

-- Grant permissions
GRANT ALL ON diagnosis_procedure_suggestions TO authenticated;
GRANT ALL ON diagnosis_procedure_suggestions TO anon;
