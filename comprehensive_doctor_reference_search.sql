-- COMPREHENSIVE SEARCH FOR created_by_doctor_id REFERENCES
-- Run this in Supabase SQL Editor to identify all problematic references

-- 1. Find all triggers on treatment_groups table
SELECT 
    t.tgname as trigger_name,
    p.proname as function_name,
    t.tgenabled as is_enabled,
    t.tgtype as trigger_type,
    t.tgrelid::regclass as table_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE t.tgrelid = 'treatment_groups'::regclass
AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 2. Find all functions that reference created_by_doctor_id
SELECT 
    p.proname as function_name,
    p.prosrc as function_source,
    p.prolang as language
FROM pg_proc p
WHERE p.prosrc ILIKE '%created_by_doctor_id%'
ORDER BY p.proname;

-- 3. Find all functions that reference NEW.created_by_doctor_id specifically
SELECT 
    p.proname as function_name,
    p.prosrc as function_source,
    p.prolang as language
FROM pg_proc p
WHERE p.prosrc ILIKE '%NEW.created_by_doctor_id%'
ORDER BY p.proname;

-- 4. Check treatment_groups table structure to confirm current columns
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'treatment_groups' 
ORDER BY ordinal_position;

-- 5. Check if there are any tables that still have created_by_doctor_id
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE column_name = 'created_by_doctor_id'
ORDER BY table_name, column_name;

-- 6. Check for any remaining doctor_id columns in treatment-related tables
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name LIKE '%treatment%'
AND column_name LIKE '%doctor%'
ORDER BY table_name, column_name;
