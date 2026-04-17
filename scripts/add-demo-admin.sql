-- Add demo@hotmail.com as an admin for DEMO01 clinic
-- Password: 123456  (bcrypt hash below)
-- Run this in Supabase SQL Editor

-- 1. Make sure DEMO01 clinic exists
INSERT INTO clinics (
  id, clinic_code, name, address, phone, email, password_hash,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'DEMO01',
  'Clinifly Demo Clinic',
  '124-128 City Road, London, UK',
  '+442012345678',
  'demo@clinifly.net',
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lh3y',
  NOW(), NOW()
)
ON CONFLICT (clinic_code) DO NOTHING;

-- 2. Remove existing demo@hotmail.com / DEMO01 entry if any (for clean upsert)
DELETE FROM admins WHERE email = 'demo@hotmail.com' AND clinic_code = 'DEMO01';

-- 3. Insert demo@hotmail.com as sub-admin for DEMO01
--    password_hash = bcrypt('123456', 10)
INSERT INTO admins (email, password_hash, clinic_code, status)
VALUES (
  'demo@hotmail.com',
  '$2b$10$KHXePHNXMAQwGfsy/oTZ1.MqhVIESmoP5IArA2up5eGDI0e4IyCi2',
  'DEMO01',
  'ACTIVE'
);

-- 4. Verify
SELECT id, email, clinic_code, status FROM admins WHERE email = 'demo@hotmail.com';
