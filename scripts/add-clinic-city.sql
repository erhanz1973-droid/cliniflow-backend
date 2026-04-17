-- Add city column to clinics table for marketplace filtering
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS city TEXT;

-- Create index for city-based filtering
CREATE INDEX IF NOT EXISTS idx_clinics_city ON clinics (city);

-- Optional: backfill city from address for existing rows that have a city in their address
-- (Admins can update manually via admin-settings)
