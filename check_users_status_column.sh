#!/bin/bash

echo "🔍 CLINIFLOW - USERS TABLE STATUS COLUMN CHECK"
echo "============================================="

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
print_info "🔍 CHECKING: public.users table status column"

echo ""
print_info "📋 SQL Query to check status column:"
echo "   SELECT column_name, data_type, is_nullable, column_default"
echo "   FROM information_schema.columns"
echo "   WHERE table_schema = 'public'"
echo "   AND table_name = 'users'"
echo "   AND column_name = 'status';"

echo ""
print_info "🔧 If status column doesn't exist, run:"
echo "   ALTER TABLE public.users ADD COLUMN status TEXT DEFAULT 'PENDING';"

echo ""
print_info "🎯 Expected Result:"
echo "   ✅ Column exists: status (TEXT, nullable, default 'PENDING')"
echo "   ❌ Column missing: Need to add status column"

echo ""
print_warning "⚠️  NEXT STEPS:"
echo "   1️⃣ Connect to database"
echo "   2️⃣ Run the check query"
echo "   3️⃣ If missing, run ALTER TABLE"
echo "   4️⃣ Test approve doctor endpoint"
echo "   5️⃣ Verify 500 error is resolved"

echo ""
print_status "🔍 STATUS COLUMN CHECK SCRIPT READY!"
print_warning "⚠️  Run this SQL in your database to check the status column"
