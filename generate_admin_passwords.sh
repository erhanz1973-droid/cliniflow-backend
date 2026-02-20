#!/bin/bash

echo "🔐 GENERATING BCRYPT PASSWORDS FOR SUPABASE"
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
print_info "Generating bcrypt hashes for admin users..."

# Generate bcrypt hashes for admin passwords
node -e "
const bcrypt = require('bcrypt');

const adminUsers = [
  { email: 'admin@clinifly.net', password: 'admin123', clinicCode: 'ADMIN' },
  { email: 'cem@clinifly.net', password: '123456', clinicCode: 'CEM' },
  { email: 'test@test.com', password: 'test123', clinicCode: 'TEST' }
];

console.log('🔐 BCRYPT PASSWORDS FOR SUPABASE:');
console.log('====================================');

adminUsers.forEach(async (user) => {
  const hash = await bcrypt.hash(user.password, 10);
  console.log(\`Email: \${user.email}\`);
  console.log(\`Clinic: \${user.clinicCode}\`);
  console.log(\`Password: \${user.password}\`);
  console.log(\`Hash: \${hash}\`);
  console.log('');
});
"

echo ""
print_status "✅ Password hashes generated"
print_warning "⚠️  Copy these hashes into your Supabase SQL"
print_info "📋 Run the SQL in Supabase SQL Editor:"
print_info "   /Users/macbookpro/Documents/cliniflow/supabase_admins_table.sql"

echo ""
print_info "🔧 UPDATE THE SQL FILE:"
print_info "   Replace the placeholder hashes with the generated ones above"
