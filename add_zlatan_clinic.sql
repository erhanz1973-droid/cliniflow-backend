-- ================== ADD ZLATAN CLINIC ==================
-- RUN THIS IN SUPABASE SQL EDITOR IF ZLATAN CLINIC NOT FOUND

-- Insert ZLATAN clinic
INSERT INTO clinics (
  id,
  clinic_code,
  name,
  email,
  phone,
  address,
  website,
  logo_url,
  status,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'ZLATAN',
  'Baran Dental Clinic',
  'info@barandental.com',
  '+90 212 555 0123',
  'Istanbul, Turkey',
  'https://barandental.com',
  'https://barandental.com/logo.png',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Verify insertion
SELECT * FROM clinics WHERE clinic_code = 'ZLATAN';
