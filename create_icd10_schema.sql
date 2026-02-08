-- ICD-10 Master Table
CREATE TABLE IF NOT EXISTS icd10_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) NOT NULL UNIQUE,
  category VARCHAR(5) NOT NULL,
  title_tr TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ka TEXT NOT NULL,
  title_ru TEXT NOT NULL,
  description_tr TEXT,
  description_en TEXT,
  description_ka TEXT,
  description_ru TEXT,
  is_dental BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Patient ICD-10 Relation Table
CREATE TABLE IF NOT EXISTS patient_icd10 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id VARCHAR(50) NOT NULL,
  icd10_code VARCHAR(10) NOT NULL,
  tooth_number VARCHAR(5),
  diagnosis_date DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  doctor_id VARCHAR(50) NOT NULL,
  clinic_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (icd10_code) REFERENCES icd10_codes(code),
  UNIQUE(patient_id, icd10_code, tooth_number)
);

-- Doctor/Clinic ICD-10 Requirements
CREATE TABLE IF NOT EXISTS icd10_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id VARCHAR(50),
  clinic_id UUID,
  require_icd10 BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(doctor_id, clinic_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_icd10_codes_code ON icd10_codes(code);
CREATE INDEX IF NOT EXISTS idx_icd10_codes_category ON icd10_codes(category);
CREATE INDEX IF NOT EXISTS idx_patient_icd10_patient ON patient_icd10(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_icd10_code ON patient_icd10(icd10_code);
CREATE INDEX IF NOT EXISTS idx_patient_icd10_doctor ON patient_icd10(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_icd10_clinic ON patient_icd10(clinic_id);

-- Enable RLS (Row Level Security)
ALTER TABLE icd10_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_icd10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE icd10_requirements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- ICD-10 codes - everyone can read
CREATE POLICY "Public read access for ICD-10 codes" ON icd10_codes
  FOR SELECT USING (true);

-- Patient ICD-10 - doctors can read/write their own patients
CREATE POLICY "Doctors can manage patient ICD-10" ON patient_icd10
  FOR ALL USING (
    doctor_id = current_setting('app.current_doctor_id', true) OR
    current_setting('app.current_role', true) = 'ADMIN'
  );

-- ICD-10 requirements - admins and doctors can read
CREATE POLICY "Read access for ICD-10 requirements" ON icd10_requirements
  FOR SELECT USING (
    current_setting('app.current_role', true) IN ('ADMIN', 'DOCTOR')
  );

-- ICD-10 requirements - admins can write
CREATE POLICY "Admins can manage ICD-10 requirements" ON icd10_requirements
  FOR ALL USING (current_setting('app.current_role', true) = 'ADMIN');
