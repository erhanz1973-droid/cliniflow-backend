-- Extended marketplace trust signals + patient save/follow foundation.
-- Canonical: cliniflow-backend-clean/supabase/migrations/20260607120000_clinic_marketplace_trust_extended.sql

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS international_patient_count INTEGER,
  ADD COLUMN IF NOT EXISTS certifications TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS awards TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_tier TEXT NOT NULL DEFAULT 'standard';

CREATE INDEX IF NOT EXISTS idx_clinics_discovery_featured
  ON public.clinics (country, is_featured)
  WHERE is_listed = true AND is_featured = true;

CREATE TABLE IF NOT EXISTS public.patient_clinic_saved (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  notify_updates BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (patient_id, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_clinic_saved_patient
  ON public.patient_clinic_saved (patient_id, created_at DESC);
