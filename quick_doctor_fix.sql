-- Hızlı fix - Supabase SQL Editor'da çalıştırın

-- 1. Önce mevcut durum kontrol
SELECT patient_id, name, phone, status, clinic_code, clinic_id 
FROM patients 
WHERE role = 'DOCTOR' AND patient_id = 'DBK48';

-- 2. Status ve clinic bilgilerini güncelle
UPDATE patients 
SET 
  status = 'ACTIVE',
  updated_at = NOW(),
  clinic_code = 'ERHANCAN'
WHERE patient_id = 'DBK48' AND role = 'DOCTOR';

-- 3. Sonucu kontrol et
SELECT patient_id, name, phone, status, clinic_code, clinic_id 
FROM patients 
WHERE role = 'DOCTOR' AND patient_id = 'DBK48';
