# 🚀 Supabase Hızlı Kurulum Rehberi

## Adım 1: Supabase Projesi Oluştur (5 dakika)

1. **https://supabase.com** → Sign Up / Login
2. **"New Project"** butonuna tıkla
3. Proje bilgileri:
   - **Name**: `cliniflow` (veya istediğiniz isim)
   - **Database Password**: Güçlü bir şifre seçin ve **kaydedin**! (Örnek: `Cliniflow2024!Secure`)
   - **Region**: Size en yakın bölge (örn: `West US (North California)`)
4. **"Create new project"** → 2-3 dakika bekle

## Adım 2: Veritabanı Şemasını Oluştur (2 dakika)

1. Supabase Dashboard'da **"SQL Editor"** sekmesine git
2. **"New query"** butonuna tıkla
3. `supabase-schema.sql` dosyasının **tüm içeriğini** kopyala ve yapıştır
4. **"Run"** butonuna tıkla (veya `Ctrl+Enter`)
5. ✅ Başarı mesajı: "Success. No rows returned"

**Kontrol:** Settings → Database → Tables → Şu tablolar görünmeli:
- ✅ clinics
- ✅ patients
- ✅ registrations
- ✅ referrals
- ✅ messages
- ✅ treatments
- ✅ travel
- ✅ admin_tokens
- ✅ patient_tokens

## Adım 3: API Bilgilerini Al (1 dakika)

1. Supabase Dashboard'da **Settings → API** sekmesine git
2. Şu bilgileri kopyala:

### Project URL
```
https://xxxxxxxxxxxxx.supabase.co
```
→ Bu `SUPABASE_URL` olacak

### service_role key (Secret)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6...
```
→ Bu `SUPABASE_SERVICE_ROLE_KEY` olacak

⚠️ **ÖNEMLİ:** `service_role` key kullanın, `anon` key değil!

## Adım 4: Render'a Environment Variables Ekle (2 dakika)

1. **Render Dashboard** → Backend servisinize gidin
2. **Environment** sekmesine tıklayın
3. **"Add Environment Variable"** butonuna tıklayın
4. Şu 2 variable'ı ekleyin:

### Variable 1:
- **Key**: `SUPABASE_URL`
- **Value**: Adım 3'te kopyaladığınız Project URL

### Variable 2:
- **Key**: `SUPABASE_SERVICE_ROLE_KEY`
- **Value**: Adım 3'te kopyaladığınız service_role key

5. **"Save Changes"** butonuna tıklayın
6. Render otomatik olarak servisi restart edecek

## Adım 5: Mevcut Clinic'leri Migrate Et (Opsiyonel)

Eğer mevcut clinic'leriniz varsa (MOON, KOON, XOON), bunları Supabase'e taşımak için:

1. Backend log'larında clinic kayıtlarını kontrol edin
2. Admin panelinden clinic'leri tekrar kaydedin (Supabase'e otomatik yazılacak)
3. Veya migration script'i çalıştırın (ileride eklenebilir)

## Adım 6: Test Et (1 dakika)

1. **Render Log'larını kontrol edin:**
   - `[SUPABASE] ✅ Supabase client initialized` mesajını arayın
   - `[INIT] ⚠️ Supabase module not found` görünmemeli

2. **Admin panelinden yeni bir clinic kaydedin:**
   - Admin → Register
   - Yeni clinic bilgilerini girin
   - Log'larda `[REGISTER] ✅ Saved clinic "XXX" to Supabase` mesajını görün

3. **Supabase Dashboard'da kontrol edin:**
   - Table Editor → `clinics` tablosu
   - Yeni kaydettiğiniz clinic'i görmelisiniz

## ✅ Başarı Kontrolü

- ✅ Render log'larında Supabase bağlantısı görünüyor
- ✅ Yeni clinic kaydı Supabase'e yazılıyor
- ✅ Clinic lookup Supabase'den çalışıyor
- ✅ Admin login Supabase'den çalışıyor

## 🆘 Sorun Giderme

### "Supabase credentials not found" uyarısı
- Render'da environment variable'ların doğru eklendiğini kontrol edin
- Variable isimlerinin tam olarak `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` olduğundan emin olun
- Render servisini manuel restart edin

### "relation does not exist" hatası
- `supabase-schema.sql` dosyasını Supabase SQL Editor'de çalıştırdığınızdan emin olun
- Settings → Database → Tables'da tabloların oluşturulduğunu kontrol edin

### "permission denied" hatası
- `SUPABASE_SERVICE_ROLE_KEY` kullandığınızdan emin olun (anon key değil!)
- Service role key, Settings → API → service_role key bölümünden alınır

### Clinic'ler görünmüyor
- Render log'larında `[REGISTER] ✅ Saved clinic "XXX" to Supabase` mesajını kontrol edin
- Supabase Table Editor'da `clinics` tablosunu kontrol edin
- Clinic code'un uppercase olduğundan emin olun (örn: "XOON" değil "xoon")

## 📝 Notlar

- **Kalıcılık:** Supabase ile clinic'ler artık Render deploy'larından sonra kaybolmayacak
- **Backup:** Supabase otomatik yedekleme yapar (Settings → Database → Backups)
- **Free Tier:** Supabase free tier yeterli (500MB database, 2GB bandwidth)
- **Fallback:** Eğer Supabase bağlantısı kesilirse, backend otomatik olarak file-based storage'a döner

