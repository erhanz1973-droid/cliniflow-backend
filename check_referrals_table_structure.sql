-- Check referrals table structure
-- Run this to see what columns exist in the referrals table

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'referrals' 
AND table_schema = 'public'
ORDER BY ordinal_position;
