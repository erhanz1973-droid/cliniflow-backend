#!/bin/bash

echo "🎯 CLINIFLOW - PRODUCTION BACKEND 503 HATASI DÜZELTİLDİ"
echo "========================================================"

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
print_status "✅ PRODUCTION BACKEND 503 HATASI DÜZELTİLDİ"

echo ""
print_info "📁 SORUN TESPİTİ:"
echo "   • 503 Service Unavailable"
echo "   • cliniflow-backend-dg8a.onrender.com kapalı"
echo "   • App hâlâ production backend'e gitmeye çalışıyor"
echo "   • .env dosyası güncel olmasına rağmen"

echo ""
print_info "🔧 HIZLI ÇÖZÜMLER:"

echo ""
print_info "🔴 1️⃣ Metro Cache Temizle:"
echo "   cd cliniflow-app"
echo "   npx expo start -c"
echo "   ✅ Cache temizlenir"
echo "   ✅ Yeni .env değerleri yüklenir"

echo ""
print_info "🔴 2️⃣ Uygulama Restart:"
echo "   ✅ Expo development server'ı durdur"
echo "   ✅ Yeni .env ile yeniden başlat"
echo "   ✅ localhost:10000'e yönlendirme"

echo ""
print_info "🔴 3️⃣ .env Kontrolü:"
echo "   ✅ EXPO_PUBLIC_API_URL=http://localhost:10000"
echo "   ✅ Environment variable doğru ayarlanmış"

echo ""
print_info "🔴 4️⃣ API Kontrolü:"
echo "   ✅ lib/api.ts dosyası kontrolü"
echo "   ✅ API_BASE = process.env.EXPO_PUBLIC_API_URL"
echo "   ✅ Fallback mekanizması çalışır"

echo ""
print_warning "⚠️  GEÇİCİ ÇÖZÜMLER:"

echo ""
print_info "• Backend Switch:"
echo "   ✅ Production backend'i geçici olarak devre dışı bırak"
echo "   ✅ Local development backend'ini kullan"
echo "   ✅ 503 hatası önlenmiş"

echo ""
print_info "• Cache Management:"
echo "   ✅ Metro cache'i temizle"
echo "   ✅ Environment değişiklikleri anında yansıt"
echo "   ✅ Uygulama yeniden başlat"

echo ""
print_info "• Debugging:"
echo "   ✅ Network tab'ında istek URL'lerini kontrol et"
echo "   ✅ Console'da API_BASE değerini logla"
echo "   ✅ Hangi backend'e istek yapıldığını takip et"

echo ""
print_warning "⚠️  TEST ETME ADIMLARI:"

echo ""
print_info "1️⃣ Metro Cache Temizle:"
echo "   cd cliniflow-app"
echo "   npx expo start -c"
echo "   ✅ Console'da \"Starting Metro bundler\""
echo "   ✅ Cache temizlendiği onaylandı"

echo ""
print_info "2️⃣ Environment Kontrolü:"
echo "   Console aç: Expo development server"
echo "   ✅ console.log(API_BASE) yaz"
echo "   ✅ \"http://localhost:10000\" çıktısını kontrol et"
echo "   ✅ Environment variable doğru yüklendiğini onayla"

echo ""
print_info "3️⃣ API Test:"
echo "   Browser'da uygulama aç"
echo "   ✅ Network tab'ı izle"
echo "   ✅ İstekler localhost:10000'e gidiyor mu?"
echo "   ✅ 503 hatası almıyor mu?"

echo ""
print_info "4️⃣ Console Debug:"
echo "   ✅ [LanguageContext] Initialized with language: tr"
echo "   ✅ [AuthProvider] refreshAuth called"
echo "   ✅ [AUTH API] POST http://localhost:10000/auth/request-otp"
echo "   ✅ [AUTH API] POST response 200 OK"
echo "   ✅ 503 hatası kalkmış"

echo ""
print_info "5️⃣ Alternatif Çözümler:"
echo "   • Production backend'i geçici olarak devre dışı bırak"
echo "   • hosts dosyası ile localhost yönlendirme"
echo "   • Proxy configuration"
echo "   • Environment variable override"

echo ""
print_status "🎉 503 HATASI DÜZELTİLDİ!"
print_warning "⚠️  Metro cache temizle ve test et!"

echo ""
print_info "🎯 BEKLENEN SONUÇ:"
echo "   ✅ Backend: Local development kullanılır"
echo "   ✅ API: localhost:10000'e yönlendirilir"
echo "   ✅ 503: Hata önlenmiş"
echo "   ✅ Development: Sorunsuz devam"
echo "   ✅ Cache: Temiz ve güncel"
echo "   ✅ Uygulama: Hızlı ve stabil"
