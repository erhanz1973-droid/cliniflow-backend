-- Add notes column to encounter_treatments table
-- Run this once in Supabase SQL editor

ALTER TABLE encounter_treatments
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Optional: index for future full-text search
-- CREATE INDEX IF NOT EXISTS idx_encounter_treatments_notes
--   ON encounter_treatments USING gin(to_tsvector('simple', coalesce(notes, '')));
