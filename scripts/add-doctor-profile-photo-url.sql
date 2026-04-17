-- Add profile_photo_url column to doctors table if it doesn't exist
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

-- Backfill from patients table where role = 'DOCTOR' (matched by email)
UPDATE doctors d
SET profile_photo_url = p.profile_photo_url
FROM patients p
WHERE LOWER(d.email) = LOWER(p.email)
  AND p.role = 'DOCTOR'
  AND p.profile_photo_url IS NOT NULL
  AND d.profile_photo_url IS NULL;

-- Verify
SELECT id, name, email, profile_photo_url
FROM doctors
WHERE profile_photo_url IS NOT NULL
LIMIT 20;
