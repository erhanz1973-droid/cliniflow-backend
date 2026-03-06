#!/bin/bash

echo "🚀 CLINIFLOW - LOCAL DEVELOPMENT SETUP"
echo "======================================"

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
print_status "✅ LOCAL DEVELOPMENT DOSYALARI OLUŞTURULDU"

echo ""
print_info "📁 OLUŞTURULAN DOSYALAR:"
echo "   📄 cliniflow-backend/server/.env.local"
echo "   📄 cliniflow-app/.env.localdev"

echo ""
print_info "🔧 BACKEND AYARLARI:"
echo "   📁 cliniflow-backend/server/.env.local"
echo "   PORT=10000"
echo "   JWT_SECRET=cliniflow-secret-key-change-in-production"
echo "   SUPABASE_SERVICE_ROLE_KEY=..."
echo "   SUPABASE_URL=https://swxinrwbylygoqdcbwbt.supabase.co"

echo ""
print_info "🌐 FRONTEND AYARLARI:"
echo "   📁 cliniflow-app/.env.localdev"
echo "   VITE_API_URL=http://localhost:10000"

echo ""
print_warning "⚠️  BAŞLATMA ADIMLARI"

echo ""
print_info "🚀 TERMINAL 1 - BACKEND:"
echo "   cd cliniflow-backend"
echo "   npm install"
echo "   npm start"
echo "   ✅ Backend: http://localhost:10000"

echo ""
print_info "🚀 TERMINAL 2 - FRONTEND:"
echo "   cd cliniflow-app"
echo "   npm install"
echo "   npm run dev"
echo "   ✅ Frontend: http://localhost:5173"

echo ""
print_info "🧪 TEST ETME:"
echo "   1️⃣ Browser aç: http://localhost:5173"
echo "   2️⃣ Admin login test et"
echo "   3️⃣ Credentials: cem@clinifly.net / CEM / 123456"

echo ""
print_info "🔍 DEBUG:"
echo "   Backend health: curl http://localhost:10000/health"
echo "   Frontend console: F12 → Console"
echo "   Network: F12 → Network"

echo ""
print_status "🎉 LOCAL DEVELOPMENT HAZIR!"
print_warning "⚠️  İki terminalde başlatmayı unutma"
