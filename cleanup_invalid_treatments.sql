-- Remove invalid treatments with tooth_number = '00'
DELETE FROM encounter_treatments WHERE tooth_number = '00';
