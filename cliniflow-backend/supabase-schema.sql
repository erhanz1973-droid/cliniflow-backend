-- Supabase Database Schema for Cliniflow
-- Run this SQL in your Supabase SQL Editor

-- ================== CLINICS TABLE ==================
CREATE TABLE IF NOT EXISTS clinics (
  id BIGSERIAL PRIMARY KEY,
  clinic_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL, -- bcrypt hashed
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
  status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  referral_code TEXT DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_code ON patients(clinic_code);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);

-- ================== REGISTRATIONS TABLE ==================
-- Pending patient registrations (before approval)
CREATE TABLE IF NOT EXISTS registrations (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  clinic_code TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT DEFAULT '',
  referral_code TEXT DEFAULT '',
  created_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_registrations_request_id ON registrations(request_id);
CREATE INDEX IF NOT EXISTS idx_registrations_clinic_code ON registrations(clinic_code);

-- ================== REFERRALS TABLE ==================
CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  referral_id TEXT UNIQUE NOT NULL,
  inviter_patient_id TEXT NOT NULL,
  invited_patient_id TEXT,
  clinic_code TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  inviter_discount_percent NUMERIC DEFAULT NULL,
  invited_discount_percent NUMERIC DEFAULT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referrals_referral_id ON referrals(referral_id);
CREATE INDEX IF NOT EXISTS idx_referrals_inviter_patient_id ON referrals(inviter_patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_invited_patient_id ON referrals(invited_patient_id);
CREATE INDEX IF NOT EXISTS idx_referrals_clinic_code ON referrals(clinic_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- ================== MESSAGES TABLE ==================
CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  clinic_code TEXT NOT NULL,
  type TEXT DEFAULT 'text', -- text, attachment
  text TEXT NOT NULL,
  attachment JSONB DEFAULT NULL, -- { id, name, mime, size, url }
  from_patient BOOLEAN DEFAULT true,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_patient_id ON messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_clinic_code ON messages(clinic_code);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- ================== TREATMENTS TABLE ==================
CREATE TABLE IF NOT EXISTS treatments (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  clinic_code TEXT NOT NULL,
  procedures JSONB DEFAULT '[]'::jsonb,
  tooth_treatments JSONB DEFAULT '[]'::jsonb,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE,
  UNIQUE(patient_id)
);

CREATE INDEX IF NOT EXISTS idx_treatments_patient_id ON treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatments_clinic_code ON treatments(clinic_code);

-- ================== TRAVEL TABLE ==================
CREATE TABLE IF NOT EXISTS travel (
  id BIGSERIAL PRIMARY KEY,
  patient_id TEXT NOT NULL,
  clinic_code TEXT NOT NULL,
  travel_data JSONB DEFAULT '{}'::jsonb,
  updated_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE,
  UNIQUE(patient_id)
);

CREATE INDEX IF NOT EXISTS idx_travel_patient_id ON travel(patient_id);
CREATE INDEX IF NOT EXISTS idx_travel_clinic_code ON travel(clinic_code);

-- ================== ADMIN TOKENS TABLE ==================
CREATE TABLE IF NOT EXISTS admin_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  clinic_code TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  FOREIGN KEY (clinic_code) REFERENCES clinics(clinic_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_tokens_token ON admin_tokens(token);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_clinic_code ON admin_tokens(clinic_code);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_expires_at ON admin_tokens(expires_at);

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

CREATE INDEX IF NOT EXISTS idx_patient_tokens_token ON patient_tokens(token);
CREATE INDEX IF NOT EXISTS idx_patient_tokens_patient_id ON patient_tokens(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_tokens_clinic_code ON patient_tokens(clinic_code);
CREATE INDEX IF NOT EXISTS idx_patient_tokens_expires_at ON patient_tokens(expires_at);

