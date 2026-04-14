-- ============================================================
-- Clinifly Subscription Plan Migration  (idempotent — safe to re-run)
-- Run in Supabase SQL Editor
-- ============================================================

-- Each column is added in its own block so a pre-existing column
-- raises SQLSTATE 42701 (duplicate_column) which we ignore.

DO $$
BEGIN
  -- Must match index.cjs: normalizeClinicPlan / allowedPlans (FREE, BASIC, PRO)
  ALTER TABLE clinics ADD COLUMN plan TEXT NOT NULL DEFAULT 'FREE';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE clinics ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE clinics ADD COLUMN referral_reset_date DATE NOT NULL DEFAULT CURRENT_DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Drop legacy constraint if present (older script used free/pro only)
ALTER TABLE clinics DROP CONSTRAINT IF EXISTS clinics_plan_check;

-- Normalize legacy / invalid values (align with index.cjs normalizeClinicPlan)
UPDATE clinics
SET plan = CASE
  WHEN plan IS NULL OR TRIM(plan) = '' THEN 'FREE'
  WHEN UPPER(TRIM(plan)) IN ('PRO', 'PROFESSIONAL', 'PREMIUM') OR LOWER(TRIM(plan)) = 'pro' THEN 'PRO'
  WHEN UPPER(TRIM(plan)) = 'BASIC' OR LOWER(TRIM(plan)) = 'basic' THEN 'BASIC'
  WHEN UPPER(TRIM(plan)) = 'FREE' OR LOWER(TRIM(plan)) = 'free' THEN 'FREE'
  ELSE 'FREE'
END;

ALTER TABLE clinics ALTER COLUMN plan SET DEFAULT 'FREE';

-- Add CHECK constraint if it doesn't exist yet (safe to re-run)
DO $$
BEGIN
  ALTER TABLE clinics
    ADD CONSTRAINT clinics_plan_check CHECK (plan IN ('FREE', 'BASIC', 'PRO'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for fast plan lookups
CREATE INDEX IF NOT EXISTS idx_clinics_plan ON clinics (plan);

-- Optional: reset referral counters to the current month boundary (does not change plan)
-- Uncomment if you need a one-time referral accounting reset:
-- UPDATE clinics
-- SET referral_count = 0, referral_reset_date = DATE_TRUNC('month', CURRENT_DATE)::DATE;

-- Verify
SELECT
  id,
  clinic_code,
  name,
  plan,
  referral_count,
  referral_reset_date
FROM clinics
ORDER BY created_at DESC
LIMIT 10;
