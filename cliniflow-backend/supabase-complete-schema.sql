-- ================== CLINICS TABLE ==================
CREATE TABLE IF NOT EXISTS clinics (
  id BIGSERIAL PRIMARY KEY,
  clinic_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  google_maps_url TEXT DEFAULT '',
  default_inviter_discount_percent NUMERIC DEFAULT NULL,
  default_invited_discount_percent NUMERIC DEFAULT NULL,
  google_reviews JSONB DEFAULT '[]'::jsonb,
  trustpilot_reviews JSONB DEFAULT '[]'::jsonb,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS clinics_clinic_code_key ON clinics(clinic_code);
CREATE INDEX IF NOT EXISTS idx_clinics_clinic_code ON clinics(clinic_code);
CREATE INDEX IF NOT EXISTS idx_clinics_email ON clinics(email);

-- ================== PATIENTS TABLE ==================
CREATE TABLE IF NOT EXISTS patients (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT UNIQUE NOT NULL,
  request_id TEXT,
  clinic_code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  status TEXT DEFAULT 'PENDING',
  referral_code TEXT DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_id_key ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_code ON patients(clinic_code);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);

-- ================== PATIENT TOKENS TABLE ==================
CREATE TABLE IF NOT EXISTS patient_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  clinic_code TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_tokens_token ON patient_tokens(token);
CREATE INDEX IF NOT EXISTS idx_patient_tokens_patient_id ON patient_tokens(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_tokens_clinic_code ON patient_tokens(clinic_code);
CREATE INDEX IF NOT EXISTS idx_patient_tokens_expires_at ON patient_tokens(expires_at);

