-- Migration 002: Create messages table
-- Replaces patient_messages with a cleaner structure

CREATE TABLE IF NOT EXISTS messages (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id       UUID        NOT NULL,  -- FK to patients.id
  clinic_id        UUID        NOT NULL,  -- FK to clinics.id
  sender_type      TEXT        NOT NULL CHECK (sender_type IN ('patient', 'admin', 'doctor')),
  sender_id        TEXT        NOT NULL,  -- patients.id UUID or admin_id or doctor_id
  message_text     TEXT,
  attachment       JSONB,                 -- { name, size, url, mimeType, fileType }
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  read_at          TIMESTAMPTZ,           -- NULL = unread (only meaningful for patient messages)
  assigned_admin_id TEXT                  -- nullable, for future multi-admin support
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_patient_id    ON messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_messages_clinic_id     ON messages(clinic_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at    ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(clinic_id, sender_type, read_at)
  WHERE read_at IS NULL;

-- Enable RLS (access controlled entirely by backend)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
