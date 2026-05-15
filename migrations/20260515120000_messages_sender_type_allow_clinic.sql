-- insertMessageToSupabase (cliniflow-backend-clean) sets sender_type = 'clinic' for all
-- non-patient outbound rows (admin attachments, doctor fallback, AI). The legacy CHECK
-- only listed patient/admin/doctor, so attachment inserts hit 23514.

ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS messages_sender_type_check;

ALTER TABLE public.messages
ADD CONSTRAINT messages_sender_type_check
CHECK (
  sender_type IN (
    'patient',
    'PATIENT',
    'doctor',
    'DOCTOR',
    'clinic',
    'CLINIC',
    'admin',
    'ADMIN'
  )
);
