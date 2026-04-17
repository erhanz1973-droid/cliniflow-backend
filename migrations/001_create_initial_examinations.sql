-- Initial Examinations Database Schema
-- Complete dental examination system with atomic operations

-- A) Initial Examinations Table
CREATE TABLE IF NOT EXISTS initial_examinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_group_id UUID NOT NULL REFERENCES treatment_groups(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  general_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B) Initial Exam Teeth Table
CREATE TABLE IF NOT EXISTS initial_exam_teeth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initial_examination_id UUID NOT NULL REFERENCES initial_examinations(id) ON DELETE CASCADE,
  tooth_number VARCHAR(3) NOT NULL,
  icd10_code VARCHAR(10) NOT NULL,
  diagnosis_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- C) ICD-10 Dental Codes Table
CREATE TABLE IF NOT EXISTS icd10_dental_codes (
  code VARCHAR(10) PRIMARY KEY,
  parent_code VARCHAR(10),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_initial_examinations_treatment_group ON initial_examinations(treatment_group_id);
CREATE INDEX IF NOT EXISTS idx_initial_examinations_patient ON initial_examinations(patient_id);
CREATE INDEX IF NOT EXISTS idx_initial_examinations_doctor ON initial_examinations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_initial_exam_teeth_examination ON initial_exam_teeth(initial_examination_id);
CREATE INDEX IF NOT EXISTS idx_initial_exam_teeth_tooth ON initial_exam_teeth(tooth_number);
CREATE INDEX IF NOT EXISTS idx_icd10_dental_codes_parent ON icd10_dental_codes(parent_code);

-- Unique constraint: One examination per treatment group
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_exam_per_group ON initial_examinations(treatment_group_id);

-- RLS Policies (if needed)
ALTER TABLE initial_examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE initial_exam_teeth ENABLE ROW LEVEL SECURITY;
ALTER TABLE icd10_dental_codes ENABLE ROW LEVEL SECURITY;
