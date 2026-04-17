-- Migration: add patient_seen_at to treatment_requests
-- Run once in Supabase SQL Editor

ALTER TABLE treatment_requests
  ADD COLUMN IF NOT EXISTS patient_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_treatment_requests_unseen
  ON treatment_requests (patient_id, status, patient_seen_at)
  WHERE patient_seen_at IS NULL;
