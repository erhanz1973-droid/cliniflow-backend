-- Optional: run after `super_admin_users` exists. Adds password reset token storage.
alter table if exists public.super_admin_users
  add column if not exists reset_token text,
  add column if not exists reset_token_expires_at timestamptz;

comment on column public.super_admin_users.reset_token is 'Single-use super admin password reset token';
comment on column public.super_admin_users.reset_token_expires_at is 'UTC time when reset_token ceases to be valid';
