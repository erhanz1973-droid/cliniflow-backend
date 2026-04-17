-- Check Supabase function signature
-- Run this in Supabase SQL Editor

select proname, proargnames
from pg_proc
where proname = 'create_treatment_group_atomic';

-- Also check if there are multiple versions
select proname, proargnames, prosrc
from pg_proc
where proname = 'create_treatment_group_atomic'
order by proname;

-- Check treatment_groups table structure
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'treatment_groups'
order by ordinal_position;

-- Check treatment_group_members table structure
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'treatment_group_members'
order by ordinal_position;
