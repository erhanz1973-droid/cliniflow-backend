-- =============================================================================
-- Apple App Store Review — Demo Account Setup
-- =============================================================================
-- Run this in Supabase SQL Editor (or psql) once before App Store submission.
--
-- Test credentials for App Store submission notes:
--   Phone:       +1 555 555 0100  (enter as: +15555550100)
--   Clinic Code: DEMO01
--   Login type:  Patient
--
-- NOTE: The backend also has a hardcoded bypass (APPLE_REVIEW_PHONE_DIGITS)
-- so login works even without running this script. Running this script creates
-- real data so the reviewer sees a populated app rather than empty states.
-- =============================================================================

-- Add password_hash column to patients if it doesn't exist yet
ALTER TABLE patients ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
DECLARE
  v_clinic_id  UUID;
  v_patient_id UUID := '00000000-0000-0000-0000-000000000002';
BEGIN

  -- ── 1. Clinic ──────────────────────────────────────────────────────────────
  -- Prefer an existing DEMO01 clinic; create one only if none exists.
  SELECT id INTO v_clinic_id FROM clinics WHERE clinic_code = 'DEMO01' LIMIT 1;

  IF v_clinic_id IS NULL THEN
    v_clinic_id := '00000000-0000-0000-0000-000000000001';
    INSERT INTO clinics (
      id, clinic_code, name, address, phone, email, password_hash,
      created_at, updated_at
    ) VALUES (
      v_clinic_id,
      'DEMO01',
      'Clinifly Demo Clinic',
      '124-128 City Road, London, UK',
      '+442012345678',
      'demo@clinifly.net',
      '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh3y',
      NOW(), NOW()
    );
    RAISE NOTICE 'Created new DEMO01 clinic with id=%', v_clinic_id;
  ELSE
    RAISE NOTICE 'Using existing DEMO01 clinic with id=%', v_clinic_id;
  END IF;

  -- ── 2. Patient ─────────────────────────────────────────────────────────────
  INSERT INTO patients (
    id, patient_id, name, phone, email,
    clinic_id, clinic_code, status, role,
    referral_code, language, created_at, updated_at
  ) VALUES (
    v_patient_id,
    v_patient_id,
    'App Reviewer',
    '+15555550100',
    'reviewer@clinifly.net',
    v_clinic_id,
    'DEMO01',
    'ACTIVE',
    'PATIENT',
    'DEMO0001',
    'en',
    NOW(), NOW()
  )
  ON CONFLICT (patient_id) DO UPDATE
    SET
      status      = 'ACTIVE',
      phone       = '+15555550100',
      clinic_id   = v_clinic_id,
      clinic_code = 'DEMO01',
      updated_at  = NOW();

  RAISE NOTICE 'Demo patient upserted with patient_id=%', v_patient_id;

END $$;

-- =============================================================================
-- Done. Verify with:
--   SELECT patient_id, name, phone, status FROM patients WHERE phone = '+15555550100';
-- =============================================================================
