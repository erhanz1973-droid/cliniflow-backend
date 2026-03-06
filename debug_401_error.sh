#!/bin/bash

echo "🔍 CLINIFLOW - 401 HATA DEBUGGING"
echo "===================================="

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

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo ""
print_status "✅ DEBUGGING EKLENDİ"

echo ""
print_info "🔍 SORUN ANALİZİ:"
echo "   Email: test@test.com"
echo "   Clinic Code: TEST"
echo "   Password: ***"
echo "   Console: [LOGIN] Using API: http://localhost:5050"

echo ""
print_error "❌ PROBLEM: API variable hâlâ eski port'u gösteriyor (5050)"

echo ""
print_info "🔧 ÇÖZÜM ADIMLARI:"

echo ""
print_info "1️⃣ BROWSER CACHE TEMİZLE:"
echo "   cd cliniflow-app"
echo "   rm -rf .vite"
echo "   npm run dev"

echo ""
print_info "2️⃣ CONSOLE KONTROLÜ:"
echo "   Browser'da F12 bas"
echo "   Console'da bu logları arayın:"
echo "   📋 API_BASE VALUE: ... değerini kontrol et"
echo "   📋 ABOUT TO FETCH: ... URL'sini kontrol et"

echo ""
print_info "3️⃣ NETWORK TAB KONTROLÜ:"
echo "   F12 → Network tab"
echo "   /api/admin/login isteğinin URL'sini kontrol et"
echo "   http://localhost:5050 mı, http://localhost:10000 mı?"

echo ""
print_info "4️⃣ DOĞRU CREDENTIALS TEST:"
echo "   Email: cem@clinifly.net"
echo "   Clinic Code: CEM"
echo "   Password: 123456"

echo ""
print_status "✅ DEBUGGING HAZIR!"
print_error "❌ EĞER HÂLÂ 5050 GÖRÜYORSANIZ:"
echo "   Environment variable yüklenmiyordur"
echo "   Browser cache sorunu yaşayabilirsiniz"

echo ""
print_info "🎯 BEKLENEN CONSOLE LOG:"
echo "   [LOGIN] Using API: http://localhost:10000"
echo "   [LOGIN CREDENTIALS: { email: \"cem@clinifly.net\", clinicCode: \"CEM\", password: \"***\" }"
echo "   [ABOUT TO FETCH] http://localhost:10000/api/admin/login"
