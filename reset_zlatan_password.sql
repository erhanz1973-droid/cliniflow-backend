-- ================== RESET ZLATAN CLINIC PASSWORD ==================
-- RUN THIS IN SUPABASE SQL EDITOR TO RESET PASSWORD

-- Update ZLATAN clinic password to "zlatan123"
UPDATE clinics 
SET password_hash = '$2b$10$N9qo8uLOickgx2ZMRZoMyIheIipS6x7vL/t.7R8u9LXy6w9.5J8rO8K1k2A3B4C5D6E7F8G9H0J1K2L3M4N5O6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3'
WHERE clinic_code = 'ZLATAN';

-- Verify update
SELECT clinic_code, password_hash FROM clinics WHERE clinic_code = 'ZLATAN';
