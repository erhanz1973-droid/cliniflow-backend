-- Migration: add read_at column to offer_messages
-- Run once in Supabase SQL Editor

ALTER TABLE offer_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Index for fast unread queries
CREATE INDEX IF NOT EXISTS idx_offer_messages_unread
  ON offer_messages (offer_id, sender_role, read_at)
  WHERE read_at IS NULL;
