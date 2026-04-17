-- ============================================================
-- Stripe Subscription Migration  (idempotent — safe to re-run)
-- Run in Supabase SQL Editor
-- ============================================================

DO $$
BEGIN
  ALTER TABLE clinics ADD COLUMN stripe_customer_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE clinics ADD COLUMN stripe_subscription_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE clinics ADD COLUMN stripe_price_id TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE clinics ADD COLUMN stripe_status TEXT DEFAULT 'none';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE clinics ADD COLUMN stripe_current_period_end TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Unique indexes (safe — IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinics_stripe_customer
  ON clinics (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinics_stripe_subscription
  ON clinics (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- stripe_status values:
--   'none'               — never subscribed
--   'active'             — paying, Pro features on
--   'trialing'           — free trial
--   'past_due'           — payment failed, grace period
--   'canceled'           — subscription ended, back to Free
--   'incomplete'         — checkout started but not completed
--   'incomplete_expired' — checkout expired

-- Verify
SELECT
  id,
  clinic_code,
  name,
  plan,
  stripe_status,
  stripe_subscription_id,
  stripe_current_period_end
FROM clinics
ORDER BY created_at DESC
LIMIT 5;
