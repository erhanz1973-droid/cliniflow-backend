-- Manual approve referral fde64420-ae85-41d6-9ef1-944f5a0d1b1d
UPDATE referrals 
SET 
  status = 'APPROVED',
  approved_at = NOW(),
  inviter_discount_percent = 10,
  invited_discount_percent = 10,
  updated_at = NOW()
WHERE id = 'fde64420-ae85-41d6-9ef1-944f5a0d1b1d';

-- Verify the update
SELECT id, status, approved_at, inviter_discount_percent, invited_discount_percent
FROM referrals 
WHERE id = 'fde64420-ae85-41d6-9ef1-944f5a0d1b1d';
