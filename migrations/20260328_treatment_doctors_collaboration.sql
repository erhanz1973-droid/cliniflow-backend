-- Multi-doctor collaboration: membership per treatment plan (treatment_id → treatment_plans.id).
-- Legacy columns treatment_plans.created_by_doctor_id / assigned_doctor_id remain for display;
-- permissions use this table after backfill.

CREATE TABLE IF NOT EXISTS public.treatment_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id UUID NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'ASSISTANT'
    CHECK (role IN ('PRIMARY', 'ASSISTANT', 'VIEW_ONLY', 'CONSULTANT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT treatment_doctors_treatment_doctor_unique UNIQUE (treatment_id, doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_treatment_doctors_doctor_id ON public.treatment_doctors (doctor_id);
CREATE INDEX IF NOT EXISTS idx_treatment_doctors_treatment_id ON public.treatment_doctors (treatment_id);

-- Backfill: creator as PRIMARY
INSERT INTO public.treatment_doctors (treatment_id, doctor_id, role, created_at)
SELECT tp.id, tp.created_by_doctor_id, 'PRIMARY', COALESCE(tp.created_at, now())
FROM public.treatment_plans tp
WHERE tp.created_by_doctor_id IS NOT NULL
ON CONFLICT (treatment_id, doctor_id) DO NOTHING;

-- Backfill: assigned doctor as ASSISTANT when distinct from creator
INSERT INTO public.treatment_doctors (treatment_id, doctor_id, role, created_at)
SELECT tp.id, tp.assigned_doctor_id, 'ASSISTANT', COALESCE(tp.created_at, now())
FROM public.treatment_plans tp
WHERE tp.assigned_doctor_id IS NOT NULL
  AND tp.assigned_doctor_id IS DISTINCT FROM tp.created_by_doctor_id
ON CONFLICT (treatment_id, doctor_id) DO NOTHING;

-- If no PRIMARY remains for a treatment, promote the earliest member (one-time hygiene after backfill)
WITH missing AS (
  SELECT treatment_id
  FROM public.treatment_doctors
  GROUP BY treatment_id
  HAVING NOT bool_or(role = 'PRIMARY')
),
pick AS (
  SELECT DISTINCT ON (td.treatment_id) td.id
  FROM public.treatment_doctors td
  INNER JOIN missing m ON m.treatment_id = td.treatment_id
  ORDER BY td.treatment_id, td.created_at ASC NULLS LAST, td.id ASC
)
UPDATE public.treatment_doctors td
SET role = 'PRIMARY'
FROM pick
WHERE td.id = pick.id;
