t-- Fix encounter_treatments.scheduled_at column type
-- Change from DATE to TIMESTAMPTZ so full timestamps can be stored
-- This fixes the bug where admin panel saves correct dates to JSONB but
-- encounter_treatments.scheduled_at stays NULL (date column rejects ISO timestamps)

ALTER TABLE encounter_treatments
  ALTER COLUMN scheduled_at TYPE TIMESTAMPTZ
  USING (scheduled_at::TIMESTAMPTZ);
