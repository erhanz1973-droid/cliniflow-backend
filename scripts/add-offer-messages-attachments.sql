-- Add attachment support to offer_messages
ALTER TABLE offer_messages
  ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT CHECK (
    attachment_type IN ('image', 'xray', 'document')
  );
