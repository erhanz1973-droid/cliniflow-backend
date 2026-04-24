-- Plan fields for super-admin assign-plan (if missing)
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS plan_expiry timestamptz,
  ADD COLUMN IF NOT EXISTS plan_source text;
