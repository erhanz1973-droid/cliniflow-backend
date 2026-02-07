-- ================== CRITICAL PATIENTS TABLE SCHEMA RESET ==================
-- RUN THIS IMMEDIATELY IN SUPABASE SQL EDITOR

-- First, check current patients table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
ORDER BY ordinal_position;

-- If the table has wrong structure, drop and recreate it
-- WARNING: This will delete all existing patient data!
DROP TABLE IF EXISTS patients;

-- Create patients table with correct schema
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id VARCHAR(255) UNIQUE NOT NULL,
  clinic_id UUID NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(255),
  date_of_birth DATE,
  address TEXT,
  notes TEXT,
  patient_type VARCHAR(20) DEFAULT 'manual' CHECK (patient_type IN ('connected', 'manual')),
  app_user_id UUID NULL REFERENCES auth.users(id),
  invited_at TIMESTAMP NULL,
  connected_at TIMESTAMP NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_patients_clinic_id ON patients(clinic_id);
CREATE INDEX idx_patients_patient_id ON patients(patient_id);
CREATE INDEX idx_patients_email ON patients(email);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_patient_type ON patients(patient_type);

-- Enable RLS
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Patients can view own clinic data" ON patients
  FOR SELECT USING (auth.uid() = (SELECT id FROM clinics WHERE id = clinic_id));

CREATE POLICY "Patients can insert own clinic data" ON patients
  FOR INSERT WITH CHECK (auth.uid() = (SELECT id FROM clinics WHERE id = clinic_id));

CREATE POLICY "Patients can update own clinic data" ON patients
  FOR UPDATE USING (auth.uid() = (SELECT id FROM clinics WHERE id = clinic_id));

CREATE POLICY "Patients can delete own clinic data" ON patients
  FOR DELETE USING (auth.uid() = (SELECT id FROM clinics WHERE id = clinic_id));

-- Grant permissions
GRANT ALL ON patients TO authenticated;
GRANT SELECT ON patients TO anon;

-- Verify table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'patients' 
ORDER BY ordinal_position;
