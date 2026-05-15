-- insertMessageToSupabase sets sender_type = 'clinic' for non-patient senders.
-- See migrations/20260515120000_messages_sender_type_allow_clinic.sql (same DDL).

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
