-- ================== PATIENT MANAGEMENT SCHEMA UPDATES ==================

-- 1. Update patients table with new fields
ALTER TABLE patients 
ADD COLUMN patient_type VARCHAR(20) DEFAULT 'manual' CHECK (patient_type IN ('connected', 'manual')),
ADD COLUMN app_user_id UUID NULL REFERENCES auth.users(id),
ADD COLUMN invited_at TIMESTAMP NULL,
ADD COLUMN connected_at TIMESTAMP NULL;

-- 2. Create invite_tokens table for manual → connected conversion
CREATE TABLE invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) -- Admin who created the invite
);

-- 3. Add indexes for performance
CREATE INDEX idx_patients_patient_type ON patients(patient_type);
CREATE INDEX idx_patients_app_user_id ON patients(app_user_id);
CREATE INDEX idx_patients_clinic_id_type ON patients(clinic_id, patient_type);
CREATE INDEX idx_invite_tokens_token ON invite_tokens(token);
CREATE INDEX idx_invite_tokens_patient_id ON invite_tokens(patient_id);

-- 4. Update RLS policies for patients table
DROP POLICY IF EXISTS "patients_select_own_clinic" ON patients;
DROP POLICY IF EXISTS "patients_insert_own_clinic" ON patients;
DROP POLICY IF EXISTS "patients_update_own_clinic" ON patients;
DROP POLICY IF EXISTS "patients_delete_own_clinic" ON patients;

-- New RLS policies
CREATE POLICY "patients_select_own_clinic" ON patients
  FOR SELECT USING (
    clinic_id = current_setting('app.current_clinic_id')::UUID
  );

CREATE POLICY "patients_insert_own_clinic" ON patients
  FOR INSERT WITH CHECK (
    clinic_id = current_setting('app.current_clinic_id')::UUID
  );

CREATE POLICY "patients_update_own_clinic" ON patients
  FOR UPDATE USING (
    clinic_id = current_setting('app.current_clinic_id')::UUID
  );

CREATE POLICY "patients_delete_own_clinic" ON patients
  FOR DELETE USING (
    clinic_id = current_setting('app.current_clinic_id')::UUID
  );

-- 5. RLS policies for invite_tokens table
ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_tokens_select_own_clinic" ON invite_tokens
  FOR SELECT USING (
    clinic_id = current_setting('app.current_clinic_id')::UUID
  );

CREATE POLICY "invite_tokens_insert_own_clinic" ON invite_tokens
  FOR INSERT WITH CHECK (
    clinic_id = current_setting('app.current_clinic_id')::UUID
  );

-- 6. Function to generate unique invite tokens
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS TEXT AS $$
DECLARE
  token TEXT;
  token_exists BOOLEAN;
BEGIN
  LOOP
    token := encode(gen_random_bytes(32), 'hex');
    SELECT EXISTS(SELECT 1 FROM invite_tokens WHERE token = token) INTO token_exists;
    EXIT WHEN NOT token_exists;
  END LOOP;
  RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to create invite token
CREATE OR REPLACE FUNCTION create_patient_invite(patient_uuid UUID, admin_uuid UUID, expires_hours INTEGER DEFAULT 168) -- 7 days default
RETURNS UUID AS $$
DECLARE
  new_token_id UUID;
  token_text TEXT;
BEGIN
  -- Generate unique token
  token_text := generate_invite_token();
  
  -- Create invite token
  INSERT INTO invite_tokens (patient_id, token, clinic_id, expires_at, created_by)
  VALUES (
    patient_uuid,
    token_text,
    (SELECT clinic_id FROM patients WHERE id = patient_uuid),
    CURRENT_TIMESTAMP + (expires_hours || ' hours')::INTERVAL,
    admin_uuid
  )
  RETURNING id INTO new_token_id;
  
  -- Update patient invited_at
  UPDATE patients 
  SET invited_at = CURRENT_TIMESTAMP,
      patient_type = 'manual' -- Ensure patient type is manual before invite
  WHERE id = patient_uuid;
  
  RETURN new_token_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to convert manual patient to connected
CREATE OR REPLACE FUNCTION convert_manual_to_connected(patient_uuid UUID, app_user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  token_used BOOLEAN;
BEGIN
  -- Check if patient exists and is manual
  IF NOT EXISTS(SELECT 1 FROM patients WHERE id = patient_uuid AND patient_type = 'manual') THEN
    RETURN FALSE;
  END IF;
  
  -- Update patient to connected
  UPDATE patients 
  SET patient_type = 'connected',
      app_user_id = app_user_uuid,
      connected_at = CURRENT_TIMESTAMP
  WHERE id = patient_uuid;
  
  -- Mark invite token as used
  UPDATE invite_tokens 
  SET used_at = CURRENT_TIMESTAMP
  WHERE patient_id = patient_uuid AND used_at IS NULL;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. View for patient statistics
CREATE OR REPLACE VIEW patient_stats AS
SELECT 
  clinic_id,
  COUNT(*) as total_patients,
  COUNT(*) FILTER (WHERE patient_type = 'connected') as connected_patients,
  COUNT(*) FILTER (WHERE patient_type = 'manual') as manual_patients,
  ROUND(
    (COUNT(*) FILTER (WHERE patient_type = 'connected')::DECIMAL / NULLIF(COUNT(*), 0)) * 100, 
    2
  ) as conversion_rate
FROM patients
GROUP BY clinic_id;

-- 10. Grant permissions
GRANT SELECT, INSERT, UPDATE ON patients TO authenticated;
GRANT SELECT, INSERT ON invite_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION generate_invite_token() TO authenticated;
GRANT EXECUTE ON FUNCTION create_patient_invite(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION convert_manual_to_connected(UUID, UUID) TO authenticated;
GRANT SELECT ON patient_stats TO authenticated;
