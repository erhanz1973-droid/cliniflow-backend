-- Add columns to doctors table
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed common departments
INSERT INTO departments (name) VALUES
  ('General Dentistry'),
  ('Implantology'),
  ('Orthodontics'),
  ('Oral Surgery'),
  ('Periodontology'),
  ('Endodontics'),
  ('Pedodontics'),
  ('Prosthodontics')
ON CONFLICT DO NOTHING;

-- Specialities
CREATE TABLE IF NOT EXISTS specialities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

INSERT INTO specialities (name) VALUES
  ('Implantology'),
  ('Orthodontics'),
  ('Oral Surgery'),
  ('Periodontology'),
  ('Endodontics'),
  ('Pedodontics'),
  ('Prosthodontics'),
  ('Cosmetic Dentistry'),
  ('Teeth Whitening'),
  ('Veneers'),
  ('All-on-4'),
  ('Zirconia Crowns'),
  ('Dental Tourism'),
  ('Emergency Dentistry')
ON CONFLICT (name) DO NOTHING;

-- Doctor <-> Specialities (many-to-many)
CREATE TABLE IF NOT EXISTS doctor_specialities (
  doctor_id UUID NOT NULL,
  speciality_id UUID NOT NULL,
  PRIMARY KEY (doctor_id, speciality_id)
);

-- Languages
CREATE TABLE IF NOT EXISTS languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

INSERT INTO languages (name) VALUES
  ('English'),
  ('Turkish'),
  ('German'),
  ('Russian'),
  ('Arabic'),
  ('French'),
  ('Spanish'),
  ('Italian'),
  ('Dutch'),
  ('Polish'),
  ('Ukrainian'),
  ('Persian')
ON CONFLICT (name) DO NOTHING;

-- Doctor <-> Languages (many-to-many)
CREATE TABLE IF NOT EXISTS doctor_languages (
  doctor_id UUID NOT NULL,
  language_id UUID NOT NULL,
  PRIMARY KEY (doctor_id, language_id)
);

-- Doctor Schedule
CREATE TABLE IF NOT EXISTS doctor_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  UNIQUE (doctor_id, weekday)
);
