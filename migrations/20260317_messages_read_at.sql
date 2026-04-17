-- Add read_at column to patient_messages for admin read tracking
ALTER TABLE patient_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast unread query (WHERE read_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_patient_messages_unread
  ON patient_messages (patient_id, from_role)
  WHERE read_at IS NULL;
