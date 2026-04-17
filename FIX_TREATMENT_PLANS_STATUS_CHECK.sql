-- Align treatment_plans_status_check with enum values used by backend routes.
-- Run in Supabase SQL editor on the same project used by local backend.

BEGIN;

ALTER TABLE public.treatment_plans
  DROP CONSTRAINT IF EXISTS treatment_plans_status_check;

ALTER TABLE public.treatment_plans
  ADD CONSTRAINT treatment_plans_status_check
  CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED'));

COMMIT;
