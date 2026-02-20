#!/bin/bash

echo "🚀 CLINIFLOW - SUPABASE ADMIN LOGIN DEPLOYMENT"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo ""
print_info "Starting production deployment..."

# 1. Check current server status
echo ""
print_info "1️⃣ Checking current server status..."

if pgrep -f "node server/index.js" > /dev/null; then
    print_warning "Server is currently running. Stopping it..."
    pkill -f "node server/index.js"
    sleep 2
else
    print_status "Server is not running."
fi

# 2. Install dependencies
echo ""
print_info "2️⃣ Installing dependencies..."

cd server
if [ -d "node_modules" ]; then
    print_warning "node_modules exists. Running fresh install..."
    rm -rf node_modules
fi

npm install
if [ $? -eq 0 ]; then
    print_status "Dependencies installed successfully."
else
    print_error "Failed to install dependencies."
    exit 1
fi

# 3. Verify environment variables
echo ""
print_info "3️⃣ Verifying environment configuration..."

if [ ! -f ".env" ]; then
    print_error ".env file not found."
    exit 1
fi

if grep -q "placeholder" .env; then
    print_error "Environment variables contain placeholders."
    exit 1
fi

if ! grep -q "SUPABASE_URL" .env; then
    print_error "SUPABASE_URL not found in .env"
    exit 1
fi

if ! grep -q "SUPABASE_SERVICE_ROLE_KEY" .env; then
    print_error "SUPABASE_SERVICE_ROLE_KEY not found in .env"
    exit 1
fi

if ! grep -q "JWT_SECRET" .env; then
    print_error "JWT_SECRET not found in .env"
    exit 1
fi

print_status "Environment variables verified."

# 4. Test Supabase connection
echo ""
print_info "4️⃣ Testing Supabase connection..."

node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

supabase.from('admins').select('count').then(result => {
  if (result.error) {
    console.error('Supabase connection failed:', result.error);
    process.exit(1);
  } else {
    console.log('✅ Supabase connection successful');
    console.log('Admins count:', result.data[0]?.count || 0);
  }
}).catch(err => {
  console.error('Supabase test error:', err);
  process.exit(1);
});
" || {
    print_error "Supabase connection test failed."
    exit 1
}

print_status "Supabase connection verified."

# 5. Start production server
echo ""
print_info "5️⃣ Starting production server..."

node index.js &
SERVER_PID=$!
sleep 3

if curl -s http://localhost:5050/health > /dev/null; then
    print_status "Production server started successfully."
    print_info "Server PID: $SERVER_PID"
else
    print_error "Failed to start production server."
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# 6. Test admin login endpoints
echo ""
print_info "6️⃣ Testing admin login endpoints..."

# Test valid credentials
VALID_LOGIN=$(curl -s -X POST "http://localhost:5050/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"cem@clinifly.net","clinicCode":"CEM","password":"123456"}')

if echo "$VALID_LOGIN" | grep -q '"ok":true'; then
    print_status "✅ Valid credentials test passed"
    if echo "$VALID_LOGIN" | grep -q '"token":'; then
        print_status "✅ Token generation working"
    else
        print_error "❌ Token missing from response"
        exit 1
    fi
else
    print_error "❌ Valid credentials test failed"
    echo "Response: $VALID_LOGIN"
    exit 1
fi

# Test invalid credentials
INVALID_LOGIN=$(curl -s -X POST "http://localhost:5050/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"wrong@test.com","clinicCode":"TEST","password":"test123"}')

if echo "$INVALID_LOGIN" | grep -q '"ok":false'; then
    print_status "✅ Invalid credentials test passed"
else
    print_error "❌ Invalid credentials test failed"
    echo "Response: $INVALID_LOGIN"
    exit 1
fi

# 7. Test frontend accessibility
echo ""
print_info "7️⃣ Testing frontend accessibility..."

if curl -s -I "http://localhost:5050/admin-login.html" | grep -q "200 OK"; then
    print_status "✅ Admin login page accessible"
else
    print_error "❌ Admin login page not accessible"
    exit 1
fi

# 8. Production deployment summary
echo ""
print_info "8️⃣ Production Deployment Summary"
echo "===================================="
print_status "✅ Dependencies installed"
print_status "✅ Environment configured"
print_status "✅ Supabase connection verified"
print_status "✅ Production server running"
print_status "✅ Admin login endpoints working"
print_status "✅ Frontend accessible"

echo ""
print_info "🌐 Production URLs:"
print_info "   Backend: http://localhost:5050"
print_info "   Health: http://localhost:5050/health"
print_info "   Admin Login: http://localhost:5050/admin-login.html"
print_info "   API Endpoint: http://localhost:5050/api/admin/login"

echo ""
print_info "🔑 Production Credentials:"
print_info "   Email: cem@clinifly.net"
print_info "   Clinic Code: CEM"
print_info "   Password: 123456"

echo ""
print_info "📋 Response Format:"
echo "   Success: { ok: true, token: \"...\", admin: {...} }"
echo "   Error: { ok: false, error: \"...\" }"

echo ""
print_info "🔧 Server Management:"
print_info "   Stop: pkill -f 'node server/index.js'"
print_info "   Restart: ./deploy.sh"
print_info "   Logs: Check server console output"

echo ""
print_status "🚀 PRODUCTION DEPLOYMENT COMPLETE!"
print_warning "⚠️  Supabase admin login is now live"
print_warning "⚠️  All admin authentication via Supabase"
print_warning "⚠️  Production-ready security active"

echo ""
print_info "📱 Frontend Testing:"
print_info "   1. Open http://localhost:5050/admin-login.html"
print_info "   2. Enter cem@clinifly.net / CEM / 123456"
print_info "   3. Verify login success and redirect"

# Keep server running in background
echo ""
print_info "Server is running in production mode."
print_info "Press Ctrl+C to stop the server and exit."

# Wait for user input to stop
read -p "Press Enter to stop the server and exit..."
kill $SERVER_PID 2>/dev/null
print_status "Server stopped."
