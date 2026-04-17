-- Treatment Requests + Doctor Offers
-- Run in Supabase SQL editor

CREATE TABLE IF NOT EXISTS treatment_requests (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id  UUID        NOT NULL,
  clinic_id   UUID        NOT NULL,
  description TEXT        NOT NULL,
  photos      JSONB       DEFAULT '[]',
  budget      TEXT,
  preferred_treatment TEXT,
  status      TEXT        DEFAULT 'pending'
                          CHECK (status IN ('pending', 'answered', 'closed')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treatment_offers (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id     UUID        NOT NULL REFERENCES treatment_requests(id) ON DELETE CASCADE,
  doctor_id      UUID        NOT NULL,
  clinic_id      UUID        NOT NULL,
  treatment_type TEXT        NOT NULL,
  price_range    TEXT,
  duration       TEXT,
  note           TEXT,
  disclaimer     TEXT        DEFAULT 'This is a preliminary estimate. Final diagnosis requires clinical examination.',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_requests_patient_id ON treatment_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_requests_clinic_id  ON treatment_requests(clinic_id);
CREATE INDEX IF NOT EXISTS idx_treatment_requests_status     ON treatment_requests(status);
CREATE INDEX IF NOT EXISTS idx_treatment_offers_request_id   ON treatment_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_treatment_offers_doctor_id    ON treatment_offers(doctor_id);
