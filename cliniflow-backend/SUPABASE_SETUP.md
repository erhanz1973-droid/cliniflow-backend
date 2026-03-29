# Supabase Setup Guide

Bu rehber, Cliniflow backend'ini Supabase PostgreSQL veritabanına geçirmek için adımları içerir.

## 1. Supabase Projesi Oluşturma

1. [Supabase](https://supabase.com) sitesine gidin ve ücretsiz hesap oluşturun
2. "New Project" butonuna tıklayın
3. Proje bilgilerini girin:
   - **Name**: `cliniflow` (veya istediğiniz isim)
   - **Database Password**: Güçlü bir şifre seçin (kaydedin!)
   - **Region**: Size en yakın bölgeyi seçin
4. "Create new project" butonuna tıklayın
5. Proje oluşturulmasını bekleyin (2-3 dakika)

## 2. Veritabanı Şemasını Oluşturma

1. Supabase Dashboard'da **SQL Editor** sekmesine gidin
2. `supabase-schema.sql` dosyasının içeriğini kopyalayın
3. SQL Editor'de yapıştırın ve **Run** butonuna tıklayın
4. Tüm tabloların oluşturulduğunu doğrulayın (Settings > Database > Tables)

## 3. Environment Variables Ayarlama

Supabase Dashboard'da **Settings > API** sekmesine gidin:

- **Project URL**: `SUPABASE_URL` olarak kullanılacak
- **service_role key** (Secret): `SUPABASE_SERVICE_ROLE_KEY` olarak kullanılacak

### Local Development (Terminal)

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### Render Deployment

1. Render Dashboard'da backend servisinize gidin
2. **Environment** sekmesine tıklayın
3. Şu environment variable'ları ekleyin:
   - `SUPABASE_URL`: Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service_role key

## 4. Backend Dependencies Kurulumu

```bash
cd /Users/macbookpro/Documents/cliniflow/server
npm install
```

## 5. Backend'i Güncelleme

Backend artık Supabase kullanacak şekilde güncellenmiştir. Environment variable'lar ayarlandığında otomatik olarak Supabase'e geçer.

## 6. Test Etme

1. Backend'i başlatın: `node index.cjs`
2. Admin panelinden yeni bir clinic kaydedin
3. Supabase Dashboard > Table Editor > `clinics` tablosunda kaydın göründüğünü kontrol edin

## Notlar

- **Fallback**: Eğer Supabase environment variable'ları ayarlanmamışsa, backend otomatik olarak JSON dosyalarına geri döner
- **Migration**: Mevcut JSON verilerini Supabase'e taşımak için bir migration script'i eklenebilir
- **Backup**: Supabase Dashboard > Settings > Database > Backups'tan otomatik yedeklemeleri kontrol edin

## Sorun Giderme

### "Supabase credentials not found" uyarısı
- Environment variable'ların doğru ayarlandığından emin olun
- Render'da environment variable'ları ekledikten sonra servisi restart edin

### "relation does not exist" hatası
- `supabase-schema.sql` dosyasını Supabase SQL Editor'de çalıştırdığınızdan emin olun
- Tabloların oluşturulduğunu Settings > Database > Tables'da kontrol edin

### "permission denied" hatası
- `SUPABASE_SERVICE_ROLE_KEY` kullandığınızdan emin olun (anon key değil)
- Service role key, Row Level Security (RLS) kurallarını bypass eder

