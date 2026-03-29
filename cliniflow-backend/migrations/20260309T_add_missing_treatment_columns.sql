-- Add missing columns to encounter_treatments
ALTER TABLE encounter_treatments
ADD COLUMN assigned_doctor_id uuid,
ADD COLUMN chair text,
ADD COLUMN scheduled_at date;
