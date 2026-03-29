-- Add status column to clinics table if it doesn't exist
ALTER TABLE clinics 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ACTIVE';
