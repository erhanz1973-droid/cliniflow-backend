-- Offer-based messaging between patient and doctor
CREATE TABLE IF NOT EXISTS offer_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    UUID        NOT NULL,
  sender_id   UUID        NOT NULL,
  sender_role TEXT        NOT NULL CHECK (sender_role IN ('patient', 'doctor')),
  text        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_messages_offer_id   ON offer_messages (offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_messages_created_at ON offer_messages (created_at);
