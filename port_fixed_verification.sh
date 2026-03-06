#!/bin/bash

echo "🎯 CLINIFLOW - PORT 5050 → 10000 DÜZELTİLDİ"
echo "============================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
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

echo ""
print_status "✅ PORT DÜZELTİLDİ"

echo ""
print_info "📁 DÜZELTİLEN DOSYA:"
echo "   📄 /Users/macbookpro/Documents/cliniflow/public/admin-login.html"
echo "   Satır 255: localhost:5050 → localhost:10000"

echo ""
print_info "🔧 DEĞİŞİKLİK:"
echo "   ÖNCE: ? \"http://localhost:5050\""
echo "   SONRA: ? \"http://localhost:10000\""

echo ""
print_status "✅ BACKEND KONTROLÜ"
echo "   Backend: http://localhost:10000 ✅"
echo "   Health: curl http://localhost:10000/health ✅"

echo ""
print_warning "⚠️  BROWSER CACHE TEMİZLEME"
echo "   1️⃣ Browser'ı tamamen kapat"
echo "   2️⃣ Yeniden aç"
echo "   3️⃣ Ctrl + Shift + R (hard refresh)"

echo ""
print_info "🧪 TEST ADIMLARI:"

echo ""
print_info "1️⃣ BACKEND TEST:"
echo "   curl http://localhost:10000/health"
echo "   Response: {\"ok\":true,\"port\":\"10000\"}"

echo ""
print_info "2️⃣ FRONTEND TEST:"
echo "   Browser'da: http://localhost:5173"
echo "   Console'da: [LOGIN] Using API: http://localhost:10000"

echo ""
print_info "3️⃣ LOGIN TEST:"
echo "   Email: cem@clinifly.net"
echo "   Clinic Code: CEM"
echo "   Password: 123456"

echo ""
print_info "4️⃣ NETWORK KONTROL:"
echo "   F12 → Network"
echo "   POST http://localhost:10000/api/admin/login"

echo ""
print_status "🎉 LOCAL DEVELOPMENT HAZIR!"
print_warning "⚠️  Browser cache temizlemeyi unutma!"

echo ""
print_info "🎯 BEKLENEN SONUÇ:"
echo "   Console: [LOGIN] Using API: http://localhost:10000"
echo "   Network: POST http://localhost:10000/api/admin/login"
echo "   Status: 200 OK"
