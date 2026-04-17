-- =============================================================================
-- Add timezone support to clinics table
-- =============================================================================
-- utc_offset_hours: e.g. 3 for Turkey (UTC+3), 4 for Georgia (UTC+4), 0 for UK
-- timezone: IANA string e.g. "Europe/Istanbul", "Asia/Tbilisi"
-- =============================================================================

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS utc_offset_hours NUMERIC DEFAULT 3;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Europe/Istanbul';

-- Set Turkey clinics (default)
UPDATE clinics SET utc_offset_hours = 3, timezone = 'Europe/Istanbul'
WHERE utc_offset_hours IS NULL OR utc_offset_hours = 3;

-- Verify
SELECT clinic_code, name, utc_offset_hours, timezone FROM clinics ORDER BY created_at;
