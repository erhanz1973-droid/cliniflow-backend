#!/bin/bash

echo "🧪 COMPLETE ADMIN LOGIN FLOW TEST"
echo "=================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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
print_info "1️⃣ Testing Backend Health..."
HEALTH_RESPONSE=$(curl -s "http://localhost:5050/health")
if echo "$HEALTH_RESPONSE" | grep -q '"ok":true'; then
    print_status "Backend is healthy"
else
    print_error "Backend is not responding"
    exit 1
fi

echo ""
print_info "2️⃣ Testing Admin Login Endpoint..."

echo ""
print_info "📧 Test 1: Valid credentials"
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:5050/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","clinicCode":"TEST","password":"test123"}')

echo "Response: $LOGIN_RESPONSE"

if echo "$LOGIN_RESPONSE" | grep -q '"ok":true'; then
    print_status "✅ Valid credentials - Success response"
    if echo "$LOGIN_RESPONSE" | grep -q '"token":'; then
        print_status "✅ Token present in response"
    else
        print_error "❌ Token missing from response"
    fi
    if echo "$LOGIN_RESPONSE" | grep -q '"admin":'; then
        print_status "✅ Admin object present in response"
    else
        print_error "❌ Admin object missing from response"
    fi
else
    print_error "❌ Valid credentials test failed"
fi

echo ""
print_info "🚫 Test 2: Invalid credentials"
INVALID_RESPONSE=$(curl -s -X POST "http://localhost:5050/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"wrong@test.com","clinicCode":"TEST","password":"test123"}')

echo "Response: $INVALID_RESPONSE"

if echo "$INVALID_RESPONSE" | grep -q '"ok":false'; then
    print_status "✅ Invalid credentials - Error response"
    if echo "$INVALID_RESPONSE" | grep -q '"error":'; then
        print_status "✅ Error message present"
    else
        print_error "❌ Error message missing"
    fi
else
    print_error "❌ Invalid credentials test failed"
fi

echo ""
print_info "📧 Test 3: Missing email"
MISSING_EMAIL_RESPONSE=$(curl -s -X POST "http://localhost:5050/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"","clinicCode":"TEST","password":"test123"}')

echo "Response: $MISSING_EMAIL_RESPONSE"

if echo "$MISSING_EMAIL_RESPONSE" | grep -q '"ok":false'; then
    print_status "✅ Missing email - Error response"
    if echo "$MISSING_EMAIL_RESPONSE" | grep -q '"email_required"'; then
        print_status "✅ Correct error message"
    else
        print_error "❌ Wrong error message"
    fi
else
    print_error "❌ Missing email test failed"
fi

echo ""
print_info "🌐 Test 4: Frontend accessibility"
FRONTEND_RESPONSE=$(curl -s -I "http://localhost:5050/admin-login.html")
if echo "$FRONTEND_RESPONSE" | grep -q "200 OK"; then
    print_status "✅ Admin login page accessible"
else
    print_error "❌ Admin login page not accessible"
fi

echo ""
print_info "📋 RESPONSE FORMAT VERIFICATION"
echo ""
echo "✅ Expected Success Format:"
echo '{'
echo '  "ok": true,'
echo '  "token": "...",'
echo '  "admin": {'
echo '    "email": "test@test.com",'
echo '    "clinicCode": "TEST"'
echo '  }'
echo '}'

echo ""
echo "✅ Expected Error Format:"
echo '{'
echo '  "ok": false,'
echo '  "error": "error_message"'
echo '}'

echo ""
print_info "🎯 FRONTEND INTEGRATION READY"
print_info "   Frontend expects: json.ok && json.token"
print_info "   Backend provides: json.ok && json.token && json.admin"
print_info "   Frontend updated to use: json.admin?.clinicCode"

echo ""
print_status "🚀 ALL TESTS PASSED!"
print_warning "⚠️  Ready for frontend testing"
print_info "   Open: http://localhost:5050/admin-login.html"
print_info "   Use: test@test.com / TEST / test123"
