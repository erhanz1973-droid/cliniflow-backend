-- Add hierarchy + pricing fields to treatment_items for typed procedures (e.g. crown types)
-- Run in Supabase SQL editor for the same DB used by backend.

BEGIN;

ALTER TABLE public.treatment_items
  ADD COLUMN IF NOT EXISTS procedure_id TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

COMMIT;
