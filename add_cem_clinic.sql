-- CEM Klinik Kodunu Ekle
-- Supabase SQL Editor'da çalıştırın

INSERT INTO clinics (
  id,
  clinic_code,
  name,
  email,
  password_hash,
  address,
  phone,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'CEM',
  'CEM Clinic',
  'cem@clinifly.net',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyIheIipS6x7vL/t.7R8u9LXy6w9.5J8rO8K1k2A3B4C5D6E7F8G9H0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3',
  'CEM Clinic Address',  -- Address eklendi
  '+905123456789',      -- Phone eklendi
  NOW(),
  NOW()
) ON CONFLICT (clinic_code) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  updated_at = NOW();

-- Kontrol et
SELECT * FROM clinics WHERE clinic_code = 'CEM';
