-- Auto-assign: clinics designate a default doctor who receives new requests
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS default_quote_owner UUID;

-- treatment_requests tracks which doctor it was auto-assigned to
ALTER TABLE treatment_requests
  ADD COLUMN IF NOT EXISTS assigned_to UUID;

CREATE INDEX IF NOT EXISTS idx_treatment_requests_assigned_to
  ON treatment_requests (assigned_to);
