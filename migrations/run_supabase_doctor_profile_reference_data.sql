-- =============================================================================
-- Doctor profil: uzmanlık + dil referans tabloları ve tohum verileri
-- =============================================================================
-- Supabase Dashboard → SQL Editor → New query → yapıştır → Run
-- Tekrar çalıştırılabilir (IF NOT EXISTS + tohumlar WHERE NOT EXISTS ile)
-- Önkoşul: public.doctors tablosu (FK için)
-- =============================================================================

-- doctors: eksik profil kolonları
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS profile_procedure_ids JSONB DEFAULT '[]'::jsonb;

-- Global uzmanlık listesi
CREATE TABLE IF NOT EXISTS public.specialities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Global dil listesi
CREATE TABLE IF NOT EXISTS public.languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Doktor ↔ uzmanlık
CREATE TABLE IF NOT EXISTS public.doctor_specialities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  speciality_id UUID NOT NULL REFERENCES public.specialities(id) ON DELETE CASCADE,
  UNIQUE (doctor_id, speciality_id)
);

-- Doktor ↔ dil
CREATE TABLE IF NOT EXISTS public.doctor_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES public.languages(id) ON DELETE CASCADE,
  UNIQUE (doctor_id, language_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_specialities_doctor_id ON public.doctor_specialities(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_languages_doctor_id ON public.doctor_languages(doctor_id);

-- Eski şemada name üzerinde UNIQUE yoksa ON CONFLICT (name) 42P10 verir; bu yüzden NOT EXISTS kullanılıyor.
-- İsteğe bağlı: Node upsert için sonra benzersiz indeks ekleyin (duplicate yoksa):
-- CREATE UNIQUE INDEX IF NOT EXISTS specialities_name_unique ON public.specialities (name);
-- CREATE UNIQUE INDEX IF NOT EXISTS languages_name_unique ON public.languages (name);

-- Tohum: uzmanlıklar (yalnızca yoksa ekle)
INSERT INTO public.specialities (name)
SELECT v.name
FROM (
  VALUES
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
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.specialities s WHERE s.name = v.name);

-- Tohum: diller (yalnızca yoksa ekle)
INSERT INTO public.languages (name)
SELECT v.name
FROM (
  VALUES
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
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.languages l WHERE l.name = v.name);

-- RLS: referans tablolar herkese okunabilir (picker listeleri)
ALTER TABLE public.specialities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "specialities_select_all" ON public.specialities;
CREATE POLICY "specialities_select_all"
  ON public.specialities FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "languages_select_all" ON public.languages;
CREATE POLICY "languages_select_all"
  ON public.languages FOR SELECT
  USING (true);

GRANT SELECT ON public.specialities TO anon, authenticated, service_role;
GRANT SELECT ON public.languages TO anon, authenticated, service_role;

-- Doğrulama (isteğe bağlı)
-- SELECT count(*) AS specialities_count FROM public.specialities;
-- SELECT count(*) AS languages_count FROM public.languages;
