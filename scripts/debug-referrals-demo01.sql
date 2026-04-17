-- Debug: DEMO01 klinik referral kayıtlarını incele
-- Run in Supabase SQL Editor

-- 1. DEMO01 clinic id'yi bul
SELECT id, clinic_code, name FROM clinics WHERE clinic_code = 'DEMO01';

-- 2. DEMO01 hastalarını listele
SELECT id, patient_id, name, clinic_id, referral_code
FROM patients
WHERE clinic_id = (SELECT id FROM clinics WHERE clinic_code = 'DEMO01')
ORDER BY created_at DESC;

-- 3. Tüm referral kayıtlarını göster (clinic_id ile)
SELECT 
  referral_id,
  clinic_id,
  inviter_patient_id,
  inviter_patient_name,
  invited_patient_id,
  invited_patient_name,
  status,
  created_at
FROM referrals
WHERE clinic_id = (SELECT id FROM clinics WHERE clinic_code = 'DEMO01')
ORDER BY created_at DESC;

-- 4. inviter/invited UUID'lerin patients tablosunda karşılığı var mı?
SELECT 
  r.referral_id,
  r.inviter_patient_name,
  p1.patient_id AS inviter_patient_code,
  p1.id AS inviter_uuid_in_db,
  r.invited_patient_name,
  p2.patient_id AS invited_patient_code,
  p2.id AS invited_uuid_in_db,
  r.status
FROM referrals r
LEFT JOIN patients p1 ON p1.id = r.inviter_patient_id
LEFT JOIN patients p2 ON p2.id = r.invited_patient_id
WHERE r.clinic_id = (SELECT id FROM clinics WHERE clinic_code = 'DEMO01');
