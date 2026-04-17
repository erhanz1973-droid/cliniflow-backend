-- Migration: change ratings unique constraint from per-offer to per-clinic
-- 1 patient can rate 1 clinic once for 'experience' and once for 'treatment'
-- regardless of how many offers / messages they have had with that clinic.

-- Drop the old per-offer constraint
ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_patient_id_offer_id_type_key;

-- Add the new per-clinic constraint
-- NOTE: clinic_id NULL rows are excluded — NULL != NULL in PostgreSQL unique indexes,
-- so marketplace (clinic-less) offers fall through and are caught by the app-level check.
ALTER TABLE ratings
  ADD CONSTRAINT ratings_patient_clinic_type_key
  UNIQUE (patient_id, clinic_id, type);
