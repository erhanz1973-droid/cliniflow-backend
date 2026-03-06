#!/bin/bash

echo "🎯 CLINIFLOW - LOCAL DEVELOPMENT KONTROL"
echo "=========================================="

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
print_status "✅ API_BASE DÜZELTİLDİ"

echo ""
print_info "📁 API_BASE Değeri:"
echo "   cliniflow-app/lib/api.ts - Satır 9"
echo "   Değer: http://localhost:10000 (VITE_API_URL'den)"

echo ""
print_info "📁 .env.local Dosyası:"
echo "   cliniflow-app/.env.local"
echo "   İçerik: VITE_API_URL=http://localhost:10000"

echo ""
print_info "🔧 FRONTEND RESTART ADIMI:"
echo "   1️⃣ Cursor terminalinde: CTRL + C"
echo "   2️⃣ npm run dev"
echo "   3️⃣ Browser refresh et"

echo ""
print_warning "⚠️  KONTROL EDİLECEKLER:"
echo "   1️⃣ Console'da: [LOGIN] Using API: http://localhost:10000"
echo "   2️⃣ Network tab'da: isteklerin localhost:10000'e gittiğini kontrol et"
echo "   3️⃣ Backend health: curl http://localhost:10000/health"

echo ""
print_status "🎉 LOCAL DEVELOPMENT HAZIR!"
print_warning "⚠️  Frontend restart etmeyi unutma!"
