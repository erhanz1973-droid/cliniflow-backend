-- Allow treatment_requests to be created without a clinic (marketplace mode)
-- Also allow treatment_offers.clinic_id to be nullable (doctor may not have a clinic assigned yet)

ALTER TABLE treatment_requests
  ALTER COLUMN clinic_id DROP NOT NULL;

ALTER TABLE treatment_offers
  ALTER COLUMN clinic_id DROP NOT NULL;

-- Drop the index that assumed clinic_id is always set (we recreate it as a partial index)
DROP INDEX IF EXISTS idx_treatment_requests_clinic_id;
CREATE INDEX IF NOT EXISTS idx_treatment_requests_clinic_id
  ON treatment_requests(clinic_id) WHERE clinic_id IS NOT NULL;
