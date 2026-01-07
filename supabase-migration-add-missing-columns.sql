-- Migration: Add missing columns to Supabase tables
-- Run this SQL in your Supabase SQL Editor if columns are missing

-- ================== CLINICS TABLE - Add missing columns ==================
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_inviter_discount_percent NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_invited_discount_percent NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_reviews JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trustpilot_reviews JSONB DEFAULT '[]'::jsonb;

-- Ensure clinic_code is unique (if not already)
CREATE UNIQUE INDEX IF NOT EXISTS clinics_clinic_code_key
ON public.clinics (clinic_code);

-- ================== PATIENTS TABLE - Verify columns exist ==================
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS patient_id TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS clinic_code TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS referral_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL;

-- Ensure patient_id is unique (if not already)
CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_id_key
ON public.patients (patient_id);

-- ================== Verify indexes exist ==================
CREATE INDEX IF NOT EXISTS idx_clinics_clinic_code ON clinics(clinic_code);
CREATE INDEX IF NOT EXISTS idx_clinics_email ON clinics(email);
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_code ON patients(clinic_code);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);

