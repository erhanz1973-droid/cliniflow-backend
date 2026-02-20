-- Create admins table for Supabase-based admin authentication
-- Run this in Supabase SQL Editor

-- Drop existing table if it exists (for clean migration)
DROP TABLE IF EXISTS admins CASCADE;

-- Create new admins table
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  clinic_code TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS admins_email_idx ON admins(email);
CREATE INDEX IF NOT EXISTS admins_clinic_code_idx ON admins(clinic_code);
CREATE INDEX IF NOT EXISTS admins_status_idx ON admins(status);

-- Insert default admin users with proper bcrypt hashes
INSERT INTO admins (email, password_hash, clinic_code, status) VALUES
  ('admin@clinifly.net', '$2b$10$IVIrQmwh2N0iwGjqczlRvesHiP9h.ppmnle8B/3qo4PPzR8QckCfO', 'ADMIN', 'ACTIVE'),
  ('cem@clinifly.net', '$2b$10$Beb4EJxSQC8BF82vvnRiJOxVa/j4LLU2wWW7HkoL4OXPfVuR3S.iG', 'CEM', 'ACTIVE'),
  ('test@test.com', '$2b$10$qpvp/bR4IZwFTLV1UnoDF.Vq1rRTrcZgMFr3s.tyTn2iE0/p8lBMW', 'TEST', 'ACTIVE');

-- Create Row Level Security (RLS) policies
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own admin record
CREATE POLICY "Users can view own admin" ON admins
  FOR SELECT USING (auth.jwt() ->> 'email' = email);

-- Policy: Users can update their own admin record
CREATE POLICY "Users can update own admin" ON admins
  FOR UPDATE USING (auth.jwt() ->> 'email' = email);

-- Policy: Admins can be managed by authenticated users
CREATE POLICY "Admins can be managed" ON admins
  FOR ALL USING (
    auth.role() = 'authenticated' AND 
    (auth.jwt() ->> 'email' = email OR auth.jwt() ->> 'role' = 'SUPER_ADMIN')
  );

-- Grant necessary permissions
GRANT ALL ON admins TO authenticated;
GRANT ALL ON admins TO service_role;
