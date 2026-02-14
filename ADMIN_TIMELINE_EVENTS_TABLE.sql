-- Admin Timeline Events Table
-- Create table for admin dashboard timeline events

-- 1️⃣ Create admin_timeline_events table
CREATE TABLE IF NOT EXISTS admin_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- e.g. "TREATMENT_GROUP_CREATED", "DOCTOR_ASSIGNED", "TASK_ESCALATED"
    reference_id UUID, -- Reference to the related entity (treatment_group_id, task_id, etc.)
    message TEXT NOT NULL,
    details JSONB, -- Additional event details (patient_name, doctor_name, etc.)
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Indexes for performance
    CONSTRAINT admin_timeline_events_clinic_type_idx UNIQUE (clinic_id, type, reference_id, created_at)
);

-- 2️⃣ Create indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_admin_timeline_events_clinic_created_at 
ON admin_timeline_events(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_timeline_events_type 
ON admin_timeline_events(type);

CREATE INDEX IF NOT EXISTS idx_admin_timeline_events_reference_id 
ON admin_timeline_events(reference_id);

-- 3️⃣ Add RLS (Row Level Security) policies
ALTER TABLE admin_timeline_events ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can see timeline events for their clinic only
CREATE POLICY "Admins can view timeline events for their clinic"
ON admin_timeline_events FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM auth.users au
        JOIN user_roles ur ON au.id = ur.user_id
        WHERE au.id = auth.uid()
        AND ur.role = 'ADMIN'
        AND ur.clinic_id = admin_timeline_events.clinic_id
    )
);

-- Policy: Admins can insert timeline events for their clinic only
CREATE POLICY "Admins can insert timeline events for their clinic"
ON admin_timeline_events FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM auth.users au
        JOIN user_roles ur ON au.id = ur.user_id
        WHERE au.id = auth.uid()
        AND ur.role = 'ADMIN'
        AND ur.clinic_id = admin_timeline_events.clinic_id
    )
);

-- 4️⃣ Create function to add timeline events
CREATE OR REPLACE FUNCTION add_timeline_event(
    p_clinic_id UUID,
    p_type VARCHAR(50),
    p_reference_id UUID DEFAULT NULL,
    p_message TEXT,
    p_details JSONB DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO admin_timeline_events (
        clinic_id,
        type,
        reference_id,
        message,
        details,
        created_by
    )
    VALUES (
        p_clinic_id,
        p_type,
        p_reference_id,
        p_message,
        p_details,
        p_created_by
    )
    RETURNING id INTO v_event_id;
    
    RETURN v_event_id;
END;
$$;

-- 5️⃣ Grant permissions
GRANT SELECT, INSERT ON admin_timeline_events TO authenticated;
GRANT EXECUTE ON FUNCTION add_timeline_event TO authenticated;
