-- ================= TREATMENT GROUPS MIGRATION =================
-- Adds multi-doctor treatment groups functionality
-- Run in Supabase SQL Editor: https://app.supabase.com/project/_/sql

-- 1. Treatment Groups (Çoklu Doktor Tedavi Grupları)
-- NOTE: Only admins can create/manage treatment groups
CREATE TABLE IF NOT EXISTS treatment_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by_admin_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- This will be updated after admins table is available
    -- CONSTRAINT fk_treatment_groups_admin FOREIGN KEY (created_by_admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- 2. Treatment Group Members (Grup Üyeleri)
CREATE TABLE IF NOT EXISTS treatment_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_group_id UUID NOT NULL,
    doctor_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('lead', 'member', 'consultant')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_group_members_group FOREIGN KEY (treatment_group_id) REFERENCES treatment_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_group_members_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);

-- Create partial unique index for active members
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_doctor_per_group 
ON treatment_group_members(treatment_group_id, doctor_id) 
WHERE left_at IS NULL;

-- 3. Patient Group Assignments (Hasta Grup Atamaları)
-- NOTE: Only admins can assign patients to groups
CREATE TABLE IF NOT EXISTS patient_group_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_group_id UUID NOT NULL,
    patient_id UUID NOT NULL,
    assigned_by_admin_id UUID NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT fk_patient_assignments_group FOREIGN KEY (treatment_group_id) REFERENCES treatment_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_assignments_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    -- This will be updated after admins table is available
    -- CONSTRAINT fk_patient_assignments_admin FOREIGN KEY (assigned_by_admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

-- Create partial unique index for active patient assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_patient_per_group 
ON patient_group_assignments(treatment_group_id, patient_id) 
WHERE unassigned_at IS NULL;

-- 4. Update existing tables to support treatment groups

-- Add treatment_group_id to patient_encounters
ALTER TABLE patient_encounters 
ADD COLUMN IF NOT EXISTS treatment_group_id UUID REFERENCES treatment_groups(id) ON DELETE SET NULL;

-- Add treatment_group_id to treatment_plans
ALTER TABLE treatment_plans 
ADD COLUMN IF NOT EXISTS treatment_group_id UUID REFERENCES treatment_groups(id) ON DELETE SET NULL;

-- Add assigned_doctor_id to treatment_plans (which doctor is responsible for this plan)
ALTER TABLE treatment_plans 
ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL;

-- 5. Update indexes for new tables
-- NOTE: Admin indexes commented out until admins table is available
-- CREATE INDEX IF NOT EXISTS idx_treatment_groups_admin ON treatment_groups(created_by_admin_id);
CREATE INDEX IF NOT EXISTS idx_treatment_group_members_group ON treatment_group_members(treatment_group_id);
CREATE INDEX IF NOT EXISTS idx_treatment_group_members_doctor ON treatment_group_members(doctor_id);
-- CREATE INDEX IF NOT EXISTS idx_patient_group_assignments_group ON patient_group_assignments(treatment_group_id);
CREATE INDEX IF NOT EXISTS idx_patient_group_assignments_patient ON patient_group_assignments(patient_id);

-- Update existing indexes
CREATE INDEX IF NOT EXISTS idx_patient_encounters_group ON patient_encounters(treatment_group_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_group ON treatment_plans(treatment_group_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_assigned_doctor ON treatment_plans(assigned_doctor_id);

-- 6. Update triggers for new tables
CREATE TRIGGER update_treatment_groups_updated_at BEFORE UPDATE ON treatment_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Activity logging for treatment groups
CREATE OR REPLACE FUNCTION log_treatment_group_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Log the activity
    INSERT INTO treatment_activity_log (entity_type, entity_id, action, performed_by_user_id, performed_by_user_type)
    VALUES (
        TG_TABLE_NAME,
        NEW.id,
        TG_OP,
        COALESCE(NEW.created_by_admin_id, '00000000-0000-0000-0000-000000000000'),
        'admin'
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply activity logging triggers for treatment groups
DROP TRIGGER IF EXISTS log_treatment_group_activity ON treatment_groups;
CREATE TRIGGER log_treatment_group_activity AFTER INSERT ON treatment_groups FOR EACH ROW EXECUTE FUNCTION log_treatment_group_activity();

DROP TRIGGER IF EXISTS log_group_member_activity ON treatment_group_members;
CREATE TRIGGER log_group_member_activity AFTER INSERT ON treatment_group_members FOR EACH ROW EXECUTE FUNCTION log_treatment_group_activity();

DROP TRIGGER IF EXISTS log_patient_assignment_activity ON patient_group_assignments;
CREATE TRIGGER log_patient_assignment_activity AFTER INSERT ON patient_group_assignments FOR EACH ROW EXECUTE FUNCTION log_treatment_group_activity();

-- 8. Business Logic Constraints

-- Ensure treatment plans have either group assignment or individual doctor
ALTER TABLE treatment_plans 
ADD CONSTRAINT check_plan_assignment 
CHECK (
    (treatment_group_id IS NOT NULL) OR 
    (assigned_doctor_id IS NOT NULL) OR
    (created_by_doctor_id IS NOT NULL)
);

-- 9. Views for easier querying

-- Treatment groups with member count and patient count
CREATE OR REPLACE VIEW treatment_groups_summary AS
SELECT 
    tg.id,
    tg.group_name,
    tg.description,
    tg.status,
    tg.created_at,
    -- Will be updated after admins table is available
    -- a.name as created_by_admin_name,
    COUNT(DISTINCT tgm.doctor_id) as member_count,
    COUNT(DISTINCT pga.patient_id) as patient_count
FROM treatment_groups tg
-- JOIN admins a ON tg.created_by_admin_id = a.id
LEFT JOIN treatment_group_members tgm ON tg.id = tgm.treatment_group_id AND tgm.left_at IS NULL
LEFT JOIN patient_group_assignments pga ON tg.id = pga.treatment_group_id AND pga.unassigned_at IS NULL
WHERE tg.status = 'active'
GROUP BY tg.id, tg.group_name, tg.description, tg.status, tg.created_at;

-- 10. Verification
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('treatment_groups', 'treatment_group_members', 'patient_group_assignments')
ORDER BY table_name;

-- Check new columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('patient_encounters', 'treatment_plans')
AND column_name IN ('treatment_group_id', 'assigned_doctor_id')
ORDER BY table_name, ordinal_position;
