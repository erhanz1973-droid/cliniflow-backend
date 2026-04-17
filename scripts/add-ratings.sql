-- Dual rating system: experience (post-offer) + treatment (post-procedure)
CREATE TABLE IF NOT EXISTS ratings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID        NOT NULL,
  clinic_id       UUID,
  doctor_id       UUID,
  offer_id        UUID,
  request_id      UUID,
  type            TEXT        NOT NULL CHECK (type IN ('experience', 'treatment')),
  overall         INTEGER     NOT NULL CHECK (overall BETWEEN 1 AND 5),
  communication   INTEGER     CHECK (communication BETWEEN 1 AND 5),
  price           INTEGER     CHECK (price BETWEEN 1 AND 5),
  result          INTEGER     CHECK (result BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  -- One rating per patient per offer per type (prevents duplicates)
  UNIQUE (patient_id, offer_id, type)
);

CREATE INDEX IF NOT EXISTS idx_ratings_clinic_id   ON ratings (clinic_id);
CREATE INDEX IF NOT EXISTS idx_ratings_patient_id  ON ratings (patient_id);
CREATE INDEX IF NOT EXISTS idx_ratings_offer_id    ON ratings (offer_id);
CREATE INDEX IF NOT EXISTS idx_ratings_type        ON ratings (type);
