ALTER TABLE doctors ADD COLUMN IF NOT EXISTS years_of_experience INTEGER;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS university TEXT;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS graduation_year INTEGER;
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Dentist';
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS public_profile BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS doctor_procedures (
  doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
  procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
  PRIMARY KEY (doctor_id, procedure_id)
);

INSERT INTO specialities (name)
SELECT name FROM (VALUES
  ('General Dentistry'),
  ('Orthodontics'),
  ('Implantology'),
  ('Prosthodontics'),
  ('Endodontics'),
  ('Periodontics'),
  ('Oral Surgery'),
  ('Pediatric Dentistry'),
  ('Cosmetic Dentistry'),
  ('Genel Dis Hekimligi'),
  ('Ortodonti'),
  ('Implantoloji'),
  ('Protetik Dis Tedavisi'),
  ('Periodontoloji'),
  ('Agiz Cerrahisi'),
  ('Pedodonti'),
  ('Estetik Dis Hekimligi')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM specialities WHERE specialities.name = v.name);

INSERT INTO languages (name)
SELECT name FROM (VALUES
  ('English'),
  ('Turkish'),
  ('Russian'),
  ('Arabic'),
  ('German'),
  ('Georgian')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM languages WHERE languages.name = v.name);

INSERT INTO procedures (name)
SELECT name FROM (VALUES
  ('Dental Implant'),
  ('Root Canal Treatment'),
  ('Zirconia Crown'),
  ('Veneers'),
  ('Teeth Whitening'),
  ('Bone Grafting'),
  ('Sinus Lift'),
  ('Orthodontic Treatment'),
  ('Dental Bridge'),
  ('Tooth Extraction'),
  ('Periodontal Treatment'),
  ('Composite Filling')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM procedures WHERE procedures.name = v.name);
