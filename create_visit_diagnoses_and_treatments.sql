-- Visit-level diagnoses + tooth-level treatments schema
-- Tanı visit seviyesinde, tedavi tooth seviyesinde.

BEGIN;

CREATE TABLE IF NOT EXISTS public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  visit_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visits_clinic_patient_date
  ON public.visits (clinic_id, patient_id, visit_date DESC);

CREATE TABLE IF NOT EXISTS public.visit_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  visit_id uuid NOT NULL,
  icd10_code text NOT NULL,
  icd10_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_diagnoses_clinic_patient_visit
  ON public.visit_diagnoses (clinic_id, patient_id, visit_id);

CREATE INDEX IF NOT EXISTS idx_visit_diagnoses_visit
  ON public.visit_diagnoses (visit_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_visit_diagnoses_visit_id'
  ) THEN
    ALTER TABLE public.visit_diagnoses
      ADD CONSTRAINT fk_visit_diagnoses_visit_id
      FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  visit_id uuid NOT NULL,
  tooth_number text NOT NULL,
  procedure_code text,
  procedure_name text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'PLANNED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treatments_clinic_patient_visit
  ON public.treatments (clinic_id, patient_id, visit_id);

CREATE INDEX IF NOT EXISTS idx_treatments_visit_tooth
  ON public.treatments (visit_id, tooth_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_treatments_visit_id'
  ) THEN
    ALTER TABLE public.treatments
      ADD CONSTRAINT fk_treatments_visit_id
      FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
