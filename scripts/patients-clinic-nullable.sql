-- Allow patients to register without a clinic (marketplace flow)
-- Run in Supabase SQL Editor

ALTER TABLE patients ALTER COLUMN clinic_id DROP NOT NULL;
ALTER TABLE patients ALTER COLUMN clinic_code DROP NOT NULL;
