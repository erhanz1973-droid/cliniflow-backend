-- ================= TREATMENT MODULE TABLES =================
-- Run these SQL statements in Supabase SQL Editor
-- https://app.supabase.com/project/_/sql

-- 1. Patient Encounters (Muayene/Vakalar)
CREATE TABLE IF NOT EXISTS patient_encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    created_by_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    encounter_type VARCHAR(20) NOT NULL CHECK (encounter_type IN ('initial', 'followup')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Encounter Diagnoses (ICD-10 Tanıları)
CREATE TABLE IF NOT EXISTS encounter_diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
    icd10_code VARCHAR(10) NOT NULL,
    icd10_description TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_by_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Treatment Plans
CREATE TABLE IF NOT EXISTS treatment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES patient_encounters(id) ON DELETE CASCADE,
    created_by_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposed', 'approved', 'rejected', 'completed')),
    approved_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Treatment Items (Diş İşlemleri)
CREATE TABLE IF NOT EXISTS treatment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
    tooth_fdi_code INTEGER NOT NULL CHECK (tooth_fdi_code BETWEEN 11 AND 48),
    procedure_code VARCHAR(50) NOT NULL,
    procedure_name TEXT NOT NULL,
    linked_icd10_code VARCHAR(10) REFERENCES encounter_diagnoses(icd10_code),
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'cancelled')),
    created_by_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Treatment Item Prices (Fiyatlandırma)
CREATE TABLE IF NOT EXISTS treatment_item_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_item_id UUID NOT NULL REFERENCES treatment_items(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    visible_to VARCHAR(20) NOT NULL CHECK (visible_to IN ('admin', 'patient')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Treatment Activity Log (İşlem Geçmişi)
CREATE TABLE IF NOT EXISTS treatment_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('encounter', 'diagnosis', 'treatment_plan', 'treatment_item')),
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    performed_by_user_id UUID NOT NULL,
    performed_by_user_type VARCHAR(20) NOT NULL CHECK (performed_by_user_type IN ('doctor', 'admin', 'patient')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ================= INDEXES =================
CREATE INDEX IF NOT EXISTS idx_patient_encounters_patient_id ON patient_encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_encounters_doctor_id ON patient_encounters(created_by_doctor_id);
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_encounter_id ON encounter_diagnoses(encounter_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_encounter_id ON treatment_plans(encounter_id);
CREATE INDEX IF NOT EXISTS idx_treatment_items_plan_id ON treatment_items(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_treatment_activity_log_entity ON treatment_activity_log(entity_type, entity_id);

-- ================= TRIGGERS =================
-- Function to update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_patient_encounters_updated_at BEFORE UPDATE ON patient_encounters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_treatment_plans_updated_at BEFORE UPDATE ON treatment_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_treatment_items_updated_at BEFORE UPDATE ON treatment_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_treatment_item_prices_updated_at BEFORE UPDATE ON treatment_item_prices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================= VERIFICATION =================
-- Check if tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('patient_encounters', 'encounter_diagnoses', 'treatment_plans', 'treatment_items', 'treatment_item_prices', 'treatment_activity_log')
ORDER BY table_name;
