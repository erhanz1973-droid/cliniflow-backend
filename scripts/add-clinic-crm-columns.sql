-- ============================================================
-- CRM columns for clinics table
-- Run once in Supabase SQL Editor
-- ============================================================

-- Contact & location
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS contact_name   TEXT,
  ADD COLUMN IF NOT EXISTS city           TEXT,
  ADD COLUMN IF NOT EXISTS country        TEXT DEFAULT 'TR';

-- CRM tracking
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS notes          TEXT,
  ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_status     TEXT DEFAULT 'active'
    CHECK (crm_status IN ('active','inactive','prospect','churned'));

-- Index for CRM queries
CREATE INDEX IF NOT EXISTS idx_clinics_crm_status     ON clinics (crm_status);
CREATE INDEX IF NOT EXISTS idx_clinics_last_contact_at ON clinics (last_contact_at DESC NULLS LAST);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'clinics'
  AND column_name IN ('contact_name','city','country','notes','last_contact_at','crm_status')
ORDER BY column_name;
