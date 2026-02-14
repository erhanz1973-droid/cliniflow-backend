-- Treatment Architecture Refactor - Lifecycle Model
-- Remove ACTIVE status, implement junction table for group-doctor relation, make status derived from treatments

-- 1️⃣ Junction table for group-doctor relation
CREATE TABLE IF NOT EXISTS treatment_group_doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_group_id UUID NOT NULL REFERENCES treatment_groups(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false, -- Primary doctor for the group
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES admins(id), -- Admin who assigned the doctor
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique doctor per group
    UNIQUE(treatment_group_id, doctor_id)
);

-- 2️⃣ Index for performance
CREATE INDEX IF NOT EXISTS idx_treatment_group_doctors_group_id ON treatment_group_doctors(treatment_group_id);
CREATE INDEX IF NOT EXISTS idx_treatment_group_doctors_doctor_id ON treatment_group_doctors(doctor_id);
CREATE INDEX IF NOT EXISTS idx_treatment_group_doctors_primary ON treatment_group_doctors(treatment_group_id, is_primary);

-- 3️⃣ Update treatment_groups table - remove manual status management
ALTER TABLE treatment_groups 
DROP COLUMN IF EXISTS status,
ADD COLUMN IF NOT EXISTS calculated_status VARCHAR(20) GENERATED ALWAYS AS (
    CASE 
        WHEN (
            SELECT COUNT(*) 
            FROM treatments t 
            WHERE t.treatment_group_id = treatment_groups.id 
            AND t.status IN ('OPEN', 'IN_PROGRESS')
        ) > 0 THEN 'IN_PROGRESS'
        
        WHEN (
            SELECT COUNT(*) 
            FROM treatments t 
            WHERE t.treatment_group_id = treatment_groups.id 
            AND t.status = 'COMPLETED'
        ) = (
            SELECT COUNT(*) 
            FROM treatments t 
            WHERE t.treatment_group_id = treatment_groups.id
        ) AND (
            SELECT COUNT(*) 
            FROM treatments t 
            WHERE t.treatment_group_id = treatment_groups.id
        ) > 0 THEN 'COMPLETED'
        
        WHEN (
            SELECT COUNT(*) 
            FROM treatments t 
            WHERE t.treatment_group_id = treatment_groups.id 
            AND t.status = 'CANCELLED'
        ) > 0 THEN 'CANCELLED'
        
        ELSE 'OPEN'
    END
) STORED;

-- 4️⃣ Remove old status constraint (no longer needed)
ALTER TABLE treatment_groups 
DROP CONSTRAINT IF EXISTS tg_status_check;

-- 5️⃣ Add trigger to update calculated_status when treatments change
CREATE OR REPLACE FUNCTION update_treatment_group_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the calculated_status for all affected treatment groups
    UPDATE treatment_groups 
    SET updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT treatment_group_id 
        FROM treatments 
        WHERE treatment_group_id = COALESCE(NEW.treatment_group_id, OLD.treatment_group_id)
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 6️⃣ Create triggers for treatment changes
DROP TRIGGER IF EXISTS treatment_status_update_trigger ON treatments;
CREATE TRIGGER treatment_status_update_trigger
    AFTER INSERT OR UPDATE OR DELETE ON treatments
    FOR EACH ROW
    EXECUTE FUNCTION update_treatment_group_status();

-- 7️⃣ Function to get treatment group with doctors
CREATE OR REPLACE FUNCTION get_treatment_group_with_doctors(group_id UUID)
RETURNS TABLE (
    id UUID,
    patient_id UUID,
    clinic_id UUID,
    calculated_status VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    doctors JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tg.id,
        tg.patient_id,
        tg.clinic_id,
        tg.calculated_status,
        tg.created_at,
        tg.updated_at,
        (
            SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                    'id', d.id,
                    'name', d.name,
                    'email', d.email,
                    'is_primary', tgd.is_primary,
                    'assigned_at', tgd.assigned_at
                )
            )
            FROM treatment_group_doctors tgd
            JOIN doctors d ON tgd.doctor_id = d.id
            WHERE tgd.treatment_group_id = group_id
        ) as doctors
    FROM treatment_groups tg
    WHERE tg.id = group_id;
END;
$$ LANGUAGE plpgsql;

-- 8️⃣ Function to assign doctor to treatment group
CREATE OR REPLACE FUNCTION assign_doctor_to_treatment_group(
    group_id UUID,
    doctor_id UUID,
    is_primary BOOLEAN DEFAULT false,
    assigned_by UUID
)
RETURNS JSON AS $$
DECLARE
    assignment_count INTEGER;
BEGIN
    -- Check if group exists
    IF NOT EXISTS (SELECT 1 FROM treatment_groups WHERE id = group_id) THEN
        RETURN JSON_BUILD_OBJECT('success', false, 'error', 'Treatment group not found');
    END IF;
    
    -- Check if doctor exists
    IF NOT EXISTS (SELECT 1 FROM doctors WHERE id = doctor_id) THEN
        RETURN JSON_BUILD_OBJECT('success', false, 'error', 'Doctor not found');
    END IF;
    
    -- Check if already assigned
    SELECT COUNT(*) INTO assignment_count
    FROM treatment_group_doctors 
    WHERE treatment_group_id = group_id AND doctor_id = doctor_id;
    
    IF assignment_count > 0 THEN
        RETURN JSON_BUILD_OBJECT('success', false, 'error', 'Doctor already assigned to this group');
    END IF;
    
    -- If setting as primary, unset other primary assignments
    IF is_primary THEN
        UPDATE treatment_group_doctors 
        SET is_primary = false 
        WHERE treatment_group_id = group_id;
    END IF;
    
    -- Create assignment
    INSERT INTO treatment_group_doctors (treatment_group_id, doctor_id, is_primary, assigned_by)
    VALUES (group_id, doctor_id, is_primary, assigned_by);
    
    RETURN JSON_BUILD_OBJECT('success', true, 'message', 'Doctor assigned to treatment group successfully');
END;
$$ LANGUAGE plpgsql;

-- 9️⃣ Function to remove doctor from treatment group
CREATE OR REPLACE FUNCTION remove_doctor_from_treatment_group(
    group_id UUID,
    doctor_id UUID
)
RETURNS JSON AS $$
BEGIN
    DELETE FROM treatment_group_doctors 
    WHERE treatment_group_id = group_id AND doctor_id = doctor_id;
    
    IF FOUND THEN
        RETURN JSON_BUILD_OBJECT('success', true, 'message', 'Doctor removed from treatment group successfully');
    ELSE
        RETURN JSON_BUILD_OBJECT('success', false, 'error', 'Assignment not found');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 10️⃣ Migration script - move existing doctor assignments to junction table
INSERT INTO treatment_group_doctors (treatment_group_id, doctor_id, is_primary, assigned_by, assigned_at)
SELECT 
    tg.id,
    tg.primary_doctor_id,
    true, -- Existing primary_doctor_id becomes primary
    tg.created_by_admin_id,
    tg.created_at
FROM treatment_groups tg
WHERE tg.primary_doctor_id IS NOT NULL
ON CONFLICT (treatment_group_id, doctor_id) DO NOTHING;
