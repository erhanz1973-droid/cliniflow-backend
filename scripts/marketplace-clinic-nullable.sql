-- Make clinic_id nullable in treatment_requests for marketplace flow
-- Patients can now submit requests without being assigned to a clinic.
-- Run in Supabase SQL Editor.

-- Drop the NOT NULL constraint if it exists
ALTER TABLE treatment_requests ALTER COLUMN clinic_id DROP NOT NULL;

-- Ensure treatment_offers and offer_messages tables exist (idempotent)
CREATE TABLE IF NOT EXISTS treatment_offers (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id      UUID        NOT NULL REFERENCES treatment_requests(id) ON DELETE CASCADE,
  doctor_id       UUID        NOT NULL,
  clinic_id       UUID,
  treatment_type  TEXT        NOT NULL,
  price_range     TEXT,
  duration        TEXT,
  note            TEXT,
  disclaimer      TEXT        DEFAULT 'This is a preliminary estimate. Final diagnosis requires clinical examination.',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offer_messages (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id    UUID        NOT NULL REFERENCES treatment_offers(id) ON DELETE CASCADE,
  sender_id   UUID        NOT NULL,
  sender_role TEXT        NOT NULL CHECK (sender_role IN ('patient', 'doctor')),
  text        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_treatment_requests_clinic   ON treatment_requests(clinic_id);
CREATE INDEX IF NOT EXISTS idx_treatment_requests_patient  ON treatment_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_requests_status   ON treatment_requests(status);
CREATE INDEX IF NOT EXISTS idx_treatment_offers_request    ON treatment_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_offer_messages_offer        ON offer_messages(offer_id, created_at);
