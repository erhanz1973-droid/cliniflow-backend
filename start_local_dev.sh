#!/bin/bash

echo "🚀 CLINIFLOW - LOCAL DEVELOPMENT TAM KURULUM"
echo "============================================"

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
print_status "✅ LOCAL DEVELOPMENT TAMAMENLANDI"

echo ""
print_info "📋 YAPILAN DEĞİŞİKLİKLER:"

echo ""
print_info "🔧 BACKEND AYARLARI:"
echo "   📁 cliniflow-backend/server/.env.local"
echo "   ✅ PORT=10000"
echo "   ✅ JWT_SECRET=... (mevcut)"
echo "   ✅ SUPABASE_SERVICE_ROLE_KEY=... (mevcut)"
echo "   ✅ SUPABASE_URL=... (mevcut)"
echo "   ✅ NODE_ENV=development"

echo ""
print_info "🌐 FRONTEND AYARLARI:"
echo "   📁 cliniflow-app/.env.localdev"
echo "   ✅ VITE_API_URL=http://localhost:10000"
echo "   📁 cliniflow-app/lib/api.ts"
echo "   ✅ API_BASE = (import.meta as any).env.VITE_API_URL || \"http://localhost:10000\""

echo ""
print_info "📄 ADMIN HTML AYARLARI:"
echo "   📁 cliniflow-admin/public/admin-login.html"
echo "   ✅ API = window.location.hostname === \"localhost\" ? \"http://localhost:10000\" : \"https://cliniflow-backend-1.onrender.com\""

echo ""
print_warning "⚠️  BAŞLATMA ADIMLARI:"

echo ""
print_info "🚀 TERMINAL 1 - BACKEND:"
echo "   cd cliniflow-backend"
echo "   npm start"
echo "   ✅ Backend: http://localhost:10000"

echo ""
print_info "🚀 TERMINAL 2 - FRONTEND:"
echo "   cd cliniflow-app"
echo "   npm run dev"
echo "   ✅ Frontend: http://localhost:5173"

echo ""
print_info "🧪 KONTROL ADIMLARI:"

echo ""
print_info "1️⃣ BACKEND TEST:"
echo "   curl http://localhost:10000/health"
echo "   Response: {\"ok\":true,\"backend\":\"real-server\",\"port\":10000}"

echo ""
print_info "2️⃣ FRONTEND TEST:"
echo "   Browser aç: http://localhost:5173"
echo "   Console'da: [LOGIN] Using API: http://localhost:10000"

echo ""
print_info "3️⃣ NETWORK KONTROL:"
echo "   F12 → Network tab"
echo "   POST http://localhost:10000/api/admin/login"

echo ""
print_info "4️⃣ LOGIN TEST:"
echo "   Email: cem@clinifly.net"
echo "   Clinic Code: CEM"
echo "   Password: 123456"

echo ""
print_warning "⚠️  ÖNEMLİ SORUNLAR:"
echo "   Eğer hâlâ 5050 görürseniz:"
echo "   - Browser cache'ini temizleyin"
echo "   - Vite cache'sini silin: rm -rf .vite"
echo "   - Frontend'i restart edin: CTRL + C"

echo ""
print_status "🎉 LOCAL DEVELOPMENT HAZIR!"
print_warning "⚠️  İki terminalde çalıştırın!"

echo ""
print_info "🎯 AMAÇ:"
echo "   Deploy olmadan local geliştirme"
echo "   Backend + Frontend + Admin panel"
echo "   Tamamen localhost üzerinde"
