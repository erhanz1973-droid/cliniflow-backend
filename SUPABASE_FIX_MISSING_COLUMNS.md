# Supabase Eksik Kolonları Düzeltme Rehberi

## Sorun
Supabase'de `clinics` tablosunda `address`, `phone`, `website` gibi kolonlar eksik olabilir. Bu durumda backend'den gönderilen veriler Supabase'e yazılamaz.

## Çözüm Adımları

### 1. Supabase Dashboard'a Giriş Yapın
- https://supabase.com/dashboard
- Projenizi seçin

### 2. SQL Editor'ı Açın
- Sol menüden **SQL Editor** seçin
- **New Query** butonuna tıklayın

### 3. Migration SQL'ini Çalıştırın
`supabase-migration-add-missing-columns.sql` dosyasındaki SQL'i kopyalayıp SQL Editor'a yapıştırın ve **Run** butonuna tıklayın.

**VEYA** aşağıdaki SQL'i direkt çalıştırın:

```sql
-- ================== CLINICS TABLE - Add missing columns ==================
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS default_inviter_discount_percent NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_invited_discount_percent NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS google_reviews JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS trustpilot_reviews JSONB DEFAULT '[]'::jsonb;

-- Ensure clinic_code is unique (if not already)
CREATE UNIQUE INDEX IF NOT EXISTS clinics_clinic_code_key
ON public.clinics (clinic_code);

-- ================== PATIENTS TABLE - Verify columns exist ==================
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS patient_id TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS clinic_code TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS referral_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at BIGINT NOT NULL;

-- Ensure patient_id is unique (if not already)
CREATE UNIQUE INDEX IF NOT EXISTS patients_patient_id_key
ON public.patients (patient_id);

-- ================== Verify indexes exist ==================
CREATE INDEX IF NOT EXISTS idx_clinics_clinic_code ON clinics(clinic_code);
CREATE INDEX IF NOT EXISTS idx_clinics_email ON clinics(email);
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_clinic_code ON patients(clinic_code);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
```

### 4. Kolonların Eklendiğini Doğrulayın
- Sol menüden **Table Editor** seçin
- `clinics` tablosunu açın
- Şu kolonların olduğunu kontrol edin:
  - ✅ `address`
  - ✅ `phone`
  - ✅ `website`
  - ✅ `logo_url`
  - ✅ `google_maps_url`

### 5. Backend'i Test Edin
1. **Clinic bilgilerini güncelleyin:**
   - Admin panel → Settings
   - LOON clinic için adres, telefon, logo URL, website girin
   - **Kaydet** butonuna tıklayın

2. **Render dashboard'da log'ları kontrol edin:**
   - `[PUT /api/admin/clinic] ✅ Supabase is available, proceeding with update...`
   - `[SUPABASE] ✅ Successfully updated clinic "LOON"`

3. **Supabase'de kontrol edin:**
   - Table Editor → `clinics` table
   - LOON clinic'inin `address`, `phone`, `logo_url`, `website` alanlarının güncellendiğini kontrol edin

## Sorun Devam Ederse

### Backend Log'larını Kontrol Edin
Render dashboard → Logs sekmesinde şu log'ları arayın:
- `[PUT /api/admin/clinic]` ile başlayan log'lar
- `[SUPABASE]` ile başlayan log'lar
- `[SUPABASE] ❌ Error` ile başlayan hata log'ları

### Supabase RLS (Row Level Security) Kontrolü
Eğer RLS aktifse ve service role key kullanıyorsanız, RLS'yi geçici olarak devre dışı bırakabilirsiniz:

```sql
ALTER TABLE public.clinics DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients DISABLE ROW LEVEL SECURITY;
```

**NOT:** Production'da RLS'yi doğru şekilde yapılandırmanız önerilir.

## Test Endpoint'leri

### Clinic'leri Kontrol Et
```
GET https://cliniflow-server.onrender.com/api/debug/clinics
```

Response'da `supabaseClinics` objesinde LOON clinic'inin tüm alanlarını görebilirsiniz.

