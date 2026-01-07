-- Supabase: Add missing columns to clinics table
-- Copy ONLY this SQL code to Supabase SQL Editor

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

CREATE UNIQUE INDEX IF NOT EXISTS clinics_clinic_code_key
ON public.clinics (clinic_code);

