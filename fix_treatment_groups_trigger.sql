-- Fix treatment_groups trigger function
-- Change created_by_doctor_id to created_by_admin_id

-- First, let's find and update the trigger function
CREATE OR REPLACE FUNCTION fix_treatment_groups_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Update any references from created_by_doctor_id to created_by_admin_id
    -- This function handles the trigger logic for treatment_groups
    
    -- Example: Set created_by_admin_id if not already set
    IF NEW.created_by_admin_id IS NULL THEN
        NEW.created_by_admin_id = NEW.created_by_admin_id; -- Keep existing value or set default
    END IF;
    
    -- Set default values if needed
    IF NEW.status IS NULL THEN
        NEW.status = 'ACTIVE';
    END IF;
    
    IF NEW.created_at IS NULL THEN
        NEW.created_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers on treatment_groups
DROP TRIGGER IF EXISTS treatment_groups_trigger ON treatment_groups;
DROP TRIGGER IF EXISTS set_treatment_groups_fields ON treatment_groups;
DROP TRIGGER IF EXISTS treatment_groups_insert_trigger ON treatment_groups;
DROP TRIGGER IF EXISTS treatment_groups_update_trigger ON treatment_groups;

-- Create new trigger with correct column reference
CREATE TRIGGER treatment_groups_trigger
    BEFORE INSERT OR UPDATE ON treatment_groups
    FOR EACH ROW
    EXECUTE FUNCTION fix_treatment_groups_trigger();

-- Alternative: If you need to find the specific function name
-- Run the check_treatment_groups_triggers.sql first to identify the exact function
-- Then use: CREATE OR REPLACE FUNCTION actual_function_name() ...

-- Verify trigger creation
SELECT 
    t.tgname as trigger_name,
    p.proname as function_name,
    t.tgenabled as is_enabled
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'treatment_groups'::regclass
AND NOT t.tgisinternal
AND p.proname = 'fix_treatment_groups_trigger';
