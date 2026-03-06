-- Collaborative Treatment Plan Final Schema
-- Applies new authorization-aware model while preserving existing data.

BEGIN;

-- treatment_plans extensions
ALTER TABLE IF EXISTS treatment_plans
  ADD COLUMN IF NOT EXISTS patient_id UUID,
  ADD COLUMN IF NOT EXISTS diagnosis_id UUID,
  ADD COLUMN IF NOT EXISTS visible_to_patient BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_by_doctor_id UUID,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

-- normalize status enum values expected by API
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'treatment_plans' AND column_name = 'status'
  ) THEN
    ALTER TABLE treatment_plans
      DROP CONSTRAINT IF EXISTS treatment_plans_status_check;

    ALTER TABLE treatment_plans
      ADD CONSTRAINT treatment_plans_status_check
      CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'SUBMITTED', 'PROPOSED', 'APPROVED', 'REJECTED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS treatment_plan_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('PRIMARY', 'ASSISTANT', 'CONSULTANT')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (treatment_plan_id, doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_tpd_plan ON treatment_plan_doctors(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_tpd_doctor ON treatment_plan_doctors(doctor_id);
CREATE INDEX IF NOT EXISTS idx_tpd_role ON treatment_plan_doctors(role);

CREATE TABLE IF NOT EXISTS procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id UUID NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  tooth_id TEXT,
  price NUMERIC(12,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE', 'CANCELLED')),
  scheduled_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedures_plan ON procedures(treatment_plan_id);
CREATE INDEX IF NOT EXISTS idx_procedures_doctor ON procedures(doctor_id);
CREATE INDEX IF NOT EXISTS idx_procedures_patient ON procedures(patient_id);
CREATE INDEX IF NOT EXISTS idx_procedures_status ON procedures(status);

-- ensure at most one PRIMARY per plan
CREATE UNIQUE INDEX IF NOT EXISTS uq_tpd_primary_per_plan
  ON treatment_plan_doctors(treatment_plan_id)
  WHERE role = 'PRIMARY';

COMMIT;
