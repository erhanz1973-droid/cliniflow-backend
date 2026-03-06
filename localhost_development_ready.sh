#!/bin/bash

echo "🎯 CLINIFLOW - LOCALHOST DEVELOPMENT HAZIR!"
echo "========================================"

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
print_status "✅ LOCALHOST DEVELOPMENT HAZIR!"

echo ""
print_info "📁 DÜZENLENEN DOSYALAR:"
echo "   📄 cliniflow-app/.env"
echo "   📍 EXPO_PUBLIC_API_URL=http://localhost:10000"
echo "   📄 cliniflow-app/lib/api.ts"
echo "   📍 API_BASE fallback=localhost:10000"

echo ""
print_info "🔧 YAPILAN DEĞİŞİKLİKLER:"

echo ""
print_info "🔴 1️⃣ Environment Variables:"
echo "   ❌ EXPO_PUBLIC_API_URL=https://cliniflow-backend-1.onrender.com"
echo "   ✅ EXPO_PUBLIC_API_URL=http://localhost:10000"

echo ""
print_info "🔴 2️⃣ API Configuration:"
echo "   ❌ Fallback: https://cliniflow-backend-1.onrender.com"
echo "   ✅ Fallback: http://localhost:10000"

echo ""
print_info "🔴 3️⃣ Backend Target:"
echo "   ❌ Production backend (cliniflow-backend-1.onrender.com)"
echo "   ✅ Local backend (localhost:10000)"

echo ""
print_warning "⚠️  SONRAKİ ADIMLAR:"

echo ""
print_info "🔴 1️⃣ Metro Cache Temizle:"
echo "   cd cliniflow-app"
echo "   npx expo start -c"
echo "   ✅ Cache temizlenir"
echo "   ✅ Yeni .env değişkenleri yüklenir"

echo ""
print_info "🔴 2️⃣ Backend Server Başlat:"
echo "   cd cliniflow-admin"
echo "   npm start"
echo "   ✅ Local backend başlar"
echo "   ✅ /auth/request-otp endpoint aktif olur"

echo ""
print_info "🔴 3️⃣ Test Et:"
echo "   ✅ Doctor login dene"
echo "   ✅ Console'da localhost:10000'e istek yapıldığını kontrol et"
echo "   ✅ 200 OK response al"

echo ""
print_warning "⚠️  BEKLENEN LOG'LAR:"

echo ""
print_info "• Frontend Console:"
echo "   ✅ [AUTH API] POST http://localhost:10000/auth/request-otp"
echo "   ✅ [AUTH API] POST response 200 OK"
echo "   ✅ [DOCTOR LOGIN] OTP BYPASS - Direct login"

echo ""
print_info "• Backend Console:"
echo "   ✅ [AUTH REQUEST-OTP] 🔥 ENDPOINT HIT"
echo "   ✅ [AUTH REQUEST-OTP] 🔥 DOCTOR OTP BYPASS - Direct login"
echo "   ✅ 200 OK response"

echo ""
print_warning "⚠️  KONTROL LİSTESİ:"

echo ""
print_info "✅ .env dosyası:"
echo "   cat cliniflow-app/.env"
echo "   EXPO_PUBLIC_API_URL=http://localhost:10000"

echo ""
print_info "✅ API configuration:"
echo "   cat cliniflow-app/lib/api.ts"
echo "   API_BASE = process.env.EXPO_PUBLIC_API_URL || \"http://localhost:10000\""

echo ""
print_info "✅ Backend health check:"
echo "   curl http://localhost:10000/health"
echo "   {\"ok\":true,\"backend\":\"real-server\",\"port\":\"10000\"}"

echo ""
print_status "🎉 LOCALHOST DEVELOPMENT HAZIR!"
print_warning "⚠️  Metro cache temizle ve test et!"

echo ""
print_info "🎯 BEKLENEN SONUÇ:"
echo "   ✅ Frontend: localhost:10000'e istek yapacak"
echo "   ✅ Backend: Local development çalışacak"
echo "   ✅ OTP bypass: Local development'te çalışacak"
echo "   ✅ 404 hatası: Düzeltilecek"
echo "   ✅ Development: Sorunsuz devam edecek"
