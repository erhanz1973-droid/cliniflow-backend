-- treatment_prices: existing table schema:
--   id uuid, clinic_id text, type text, price numeric, currency text, is_active boolean
--
-- This migration adds the missing scheduling columns only.
ALTER TABLE treatment_prices ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE treatment_prices ADD COLUMN IF NOT EXISTS break_minutes    INTEGER NOT NULL DEFAULT 0;
