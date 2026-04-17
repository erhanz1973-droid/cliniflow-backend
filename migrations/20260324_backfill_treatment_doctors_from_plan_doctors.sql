-- Backfill: doctors who exist only in treatment_plan_doctors → treatment_doctors
-- (treatment_doctors is the permission source of truth; treatment_plan_doctors is legacy.)
-- treatment_doctors.treatment_id references treatment_plans.id (use tp.id, not tp.treatment_id).

-- Requires public.treatment_doctors from 20260328_treatment_doctors_collaboration.sql (or equivalent).

INSERT INTO public.treatment_doctors (treatment_id, doctor_id, role, created_at)
SELECT
  tp.id,
  tpd.doctor_id,
  'ASSISTANT',
  COALESCE(tpd.created_at, now())
FROM public.treatment_plan_doctors tpd
INNER JOIN public.treatment_plans tp ON tp.id = tpd.treatment_plan_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.treatment_doctors td
  WHERE td.treatment_id = tp.id
    AND td.doctor_id = tpd.doctor_id
)
ON CONFLICT (treatment_id, doctor_id) DO NOTHING;

-- If your schema uses plan_id instead of treatment_plan_id, run this block as well (skip if column missing).
-- INSERT INTO public.treatment_doctors (treatment_id, doctor_id, role, created_at)
-- SELECT
--   tp.id,
--   tpd.doctor_id,
--   'ASSISTANT',
--   COALESCE(tpd.created_at, now())
-- FROM public.treatment_plan_doctors tpd
-- INNER JOIN public.treatment_plans tp ON tp.id = tpd.plan_id
-- WHERE NOT EXISTS (
--   SELECT 1 FROM public.treatment_doctors td
--   WHERE td.treatment_id = tp.id
--     AND td.doctor_id = tpd.doctor_id
-- )
-- ON CONFLICT (treatment_id, doctor_id) DO NOTHING;
