-- Admin chat: mark patient-originated rows as read (PATCH /api/patient/:id/messages/read)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_read_at_pending
  ON public.messages (patient_id)
  WHERE read_at IS NULL;
