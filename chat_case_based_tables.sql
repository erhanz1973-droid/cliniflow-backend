-- Controlled Doctor-Patient Chat (Case-Based, Admin Managed)
-- Run this in Supabase SQL Editor before using new chat endpoints.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_id uuid not null,
  encounter_id uuid null,
  appointment_id uuid null,
  clinic_id uuid null,

  status text not null default 'CLOSED' check (status in ('CLOSED', 'OPEN', 'AUTO_CLOSED')),
  opened_by text null check (opened_by in ('ADMIN')),
  opened_at timestamptz null,
  closed_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_threads_patient_id on public.chat_threads(patient_id);
create index if not exists idx_chat_threads_doctor_id on public.chat_threads(doctor_id);
create index if not exists idx_chat_threads_status on public.chat_threads(status);
create index if not exists idx_chat_threads_appointment_id on public.chat_threads(appointment_id);
create index if not exists idx_chat_threads_clinic_id on public.chat_threads(clinic_id);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete restrict,
  sender_role text not null check (sender_role in ('DOCTOR', 'PATIENT', 'ADMIN')),
  sender_id text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_thread_id on public.chat_messages(thread_id);
create index if not exists idx_chat_messages_created_at on public.chat_messages(created_at);
create index if not exists idx_chat_messages_is_read on public.chat_messages(is_read);

-- Keep updated_at current on each update
create or replace function public.set_chat_threads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chat_threads_updated_at on public.chat_threads;
create trigger trg_chat_threads_updated_at
before update on public.chat_threads
for each row
execute function public.set_chat_threads_updated_at();

-- Legal immutability hardening: prevent deletes from application roles by policy/RLS separately if needed.
-- This script intentionally does not create any delete helpers or soft-delete columns.
