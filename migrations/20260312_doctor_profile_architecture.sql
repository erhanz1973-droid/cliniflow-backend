-- Doctor Profile Architecture Migration
-- Run this in Supabase SQL Editor

-- 1. Add columns to doctors table
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS title TEXT;

-- 2. Departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Specialities table (global list)
CREATE TABLE IF NOT EXISTS specialities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Doctor <-> Specialities relation
CREATE TABLE IF NOT EXISTS doctor_specialities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  speciality_id UUID NOT NULL REFERENCES specialities(id) ON DELETE CASCADE,
  UNIQUE(doctor_id, speciality_id)
);

-- 5. Languages table (global list)
CREATE TABLE IF NOT EXISTS languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Doctor <-> Languages relation
CREATE TABLE IF NOT EXISTS doctor_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  UNIQUE(doctor_id, language_id)
);

-- 7. Doctor schedule table
CREATE TABLE IF NOT EXISTS doctor_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  UNIQUE(doctor_id, weekday)
);

-- 8. Seed specialities
INSERT INTO specialities (name) VALUES
  ('Genel Diş Hekimliği'),
  ('Ortodonti'),
  ('Periodontoloji'),
  ('Endodonti'),
  ('Oral Cerrahi'),
  ('Protetik Diş Tedavisi'),
  ('Pedodonti'),
  ('Ağız, Diş ve Çene Cerrahisi'),
  ('Ağız, Diş ve Çene Radyolojisi'),
  ('Restoratif Diş Tedavisi'),
  ('Estetik Diş Hekimliği'),
  ('İmplantoloji'),
  ('Diş Eti Hastalıkları'),
  ('Çocuk Diş Hekimliği')
ON CONFLICT (name) DO NOTHING;

-- 9. Seed languages
INSERT INTO languages (name) VALUES
  ('Türkçe'),
  ('İngilizce'),
  ('Almanca'),
  ('Fransızca'),
  ('Arapça'),
  ('Rusça'),
  ('İspanyolca'),
  ('İtalyanca'),
  ('Portekizce'),
  ('Japonca'),
  ('Çince'),
  ('Hollandaca')
ON CONFLICT (name) DO NOTHING;
