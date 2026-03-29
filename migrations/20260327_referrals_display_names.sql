-- Optional: persist inviter/invited display names on referral rows (patient app list + admin).
-- Safe to run once; createReferralInDBFlexible skips these columns if they do not exist.

ALTER TABLE referrals ADD COLUMN IF NOT EXISTS inviter_patient_name text;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS invited_patient_name text;
