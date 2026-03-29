-- Add language preference column to patients and doctors tables
ALTER TABLE patients ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE doctors  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
