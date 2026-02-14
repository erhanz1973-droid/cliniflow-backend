-- Fix log_treatment_group_activity function
-- Change created_by_doctor_id to created_by_admin_id

-- First, let's find the existing function
SELECT proname, prosrc FROM pg_proc WHERE proname = 'log_treatment_group_activity';

-- Update the function with correct column references
CREATE OR REPLACE FUNCTION log_treatment_group_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Log treatment group activity with correct admin column reference
    
    -- Insert activity log
    INSERT INTO treatment_group_activity_log (
        treatment_group_id,
        activity_type,
        old_status,
        new_status,
        changed_by_admin_id,  -- ✅ Changed from created_by_doctor_id
        activity_timestamp,
        activity_details
    ) VALUES (
        NEW.id,
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'CREATED'
            WHEN TG_OP = 'UPDATE' THEN 'UPDATED'
            WHEN TG_OP = 'DELETE' THEN 'DELETED'
            ELSE 'UNKNOWN'
        END,
        OLD.status,
        NEW.status,
        NEW.created_by_admin_id,  -- ✅ Changed from NEW.created_by_doctor_id
        NOW(),
        CASE 
            WHEN TG_OP = 'INSERT' THEN 
                'Treatment group created: ' || COALESCE(NEW.group_name, 'Unnamed')
            WHEN TG_OP = 'UPDATE' THEN 
                'Treatment group updated from ' || COALESCE(OLD.status, 'UNKNOWN') || 
                ' to ' || COALESCE(NEW.status, 'UNKNOWN')
            WHEN TG_OP = 'DELETE' THEN 
                'Treatment group deleted: ' || COALESCE(OLD.group_name, 'Unnamed')
            ELSE 'Unknown activity'
        END
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers that use this function
DROP TRIGGER IF EXISTS log_treatment_group_activity_trigger ON treatment_groups;
DROP TRIGGER IF EXISTS treatment_groups_activity_log ON treatment_groups;

-- Create new trigger with updated function
CREATE TRIGGER log_treatment_group_activity_trigger
    AFTER INSERT OR UPDATE OR DELETE ON treatment_groups
    FOR EACH ROW
    EXECUTE FUNCTION log_treatment_group_activity();

-- Alternative: If the log table has different structure, check it first
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'treatment_group_activity_log' 
ORDER BY ordinal_position;

-- If the table still uses doctor_id columns, we might need to update the table too:
-- ALTER TABLE treatment_group_activity_log 
-- RENAME COLUMN changed_by_doctor_id TO changed_by_admin_id;

-- Verify the trigger creation
SELECT 
    t.tgname as trigger_name,
    p.proname as function_name,
    t.tgenabled as is_enabled
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'treatment_groups'::regclass
AND NOT t.tgisinternal
AND p.proname = 'log_treatment_group_activity';
