#!/bin/bash

echo "🎯 CLINIFLOW - DEBUG LOGGING EKLENDİ"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo ""
print_status "✅ DEBUG LOGGING AKTİF EDİLDİ"

echo ""
print_info "📁 DÜZENENEN DOSYALAR:"
echo "   📄 cliniflow-admin/lib/supabase.js"
echo "   📄 cliniflow-admin/index.cjs"

echo ""
print_info "🔧 EKLENEN DEBUG LOG'LARI:"

echo ""
print_info "🔴 1️⃣ getClinicByCode Function:"
echo "   ✅ LOGIN ATTEMPT logu eklendi"
echo "   ✅ SUPABASE_URL logu eklendi"
echo "   ✅ Clinic bulunamadığında tüm klinikler listelenir"
echo "   ✅ Tüm query sonuçları loglanır"

echo ""
print_info "🔴 2️⃣ Admin Login Route:"
echo "   ✅ Gelen email ve clinicCode loglanır"
echo "   ✅ SUPABASE_URL loglanır"
echo "   ✅ Database'den gelen admin loglanır"
echo "   ✅ Password karşılaştırma sonucu loglanır"
echo "   ✅ Clinic password_hash durumu loglanır"

echo ""
print_warning "⚠️  DEBUG AMAÇLARI:"

echo ""
print_info "• Admin Bulunamıyor mu?"
echo "   ✅ getClinicByCode fonksiyonuna bak"
echo "   ✅ Supabase bağlantısı kontrolü"
echo "   ✅ Database'de admin var mı?"

echo ""
print_info "• Supabase'e Bağlı mı?"
echo "   ✅ SUPABASE_URL ve SERVICE_ROLE_KEY kontrolü"
echo "   ✅ Client oluşturma durumu"

echo ""
print_info "• Password Compare Başarısız mı?"
echo "   ✅ bcrypt.compare sonucu"
echo "   ✅ Database password_hash ile karşılaştırma"

echo ""
print_warning "⚠️  TEST ETME ADIMLARI:"

echo ""
print_info "1️⃣ Backend Restart:"
echo "   cd cliniflow-admin"
echo "   npm start"
echo "   ✅ Console'da debug logları görünmeli"

echo ""
print_info "2️⃣ Login Test:"
echo "   Browser'da admin-login.html aç"
echo "   Email: cem@clinifly.net"
echo "   Clinic Code: CEM"
echo "   Password: 123456"
echo "   ✅ Console'da logları takip et"

echo ""
print_info "3️⃣ Console Kontrolü:"
echo "   F12 → Console"
echo "   ✅ LOGIN ATTEMPT: { email, clinicCode, password: \"***\" }"
echo "   ✅ SUPABASE_URL: https://swxinrwbylygoqdcbwbt.supabase.co"
echo "   ✅ ADMIN FROM DB: { ... }"
echo "   ✅ PASSWORD MATCH: true/false"
echo "   ✅ CLINIC PASSWORD_HASH: EXISTS/NULL"

echo ""
print_info "4️⃣ Hata Analizi:"
echo "   ✅ Eğer admin null ise:"
echo "     - getClinicByCode error logu"
echo "     - Tüm klinikler listesi"
echo "   ✅ Eğer admin varsa:"
echo "     - PASSWORD MATCH logu"
echo "     - password_hash durumu"

echo ""
print_status "🎉 DEBUG LOGGING HAZIR!"
print_warning "⚠️  Backend restart et ve test et!"

echo ""
print_info "🎯 BEKLENEN SONUÇ:"
echo "   ✅ 401 hatasının sebebi netleşir"
echo "   ✅ Admin bulunamama sebebi anlaşılır"
echo "   ✅ Supabase bağlantı durumu görülür"
echo "   ✅ Password verify süreci takip edilir"
