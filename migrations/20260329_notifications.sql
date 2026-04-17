-- Doctor app: assignment and other in-app notifications (backend-inserted only)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null, -- doctors.id

  type text not null,

  title text,
  message text,

  data jsonb,

  is_read boolean default false,

  created_at timestamptz default now()
);

create index if not exists idx_notifications_user_unread_created
  on notifications (user_id, created_at desc);

comment on table notifications is 'Doctor-facing notifications; user_id references doctors.id';
