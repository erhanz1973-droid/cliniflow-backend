# Admin JWT Secret Environment Variable Setup

# 1. Set admin JWT secret
export ADMIN_JWT_SECRET="cliniflow-admin-secret-2024"

# 2. Restart backend with admin secret
# JWT_SECRET=cliniflow-secret-key-2024 ADMIN_JWT_SECRET=cliniflow-admin-secret-2024 node index.cjs

# 3. Update admin.json with admin secret
# Add this to /Users/macbookpro/Documents/cliniflow/data/admins.json:
# {"id": 1, "email": "admin@clinifly.net", "password": "erhancan123", "clinicCode": "ERHANCAN", "role": "ADMIN", "status": "ACTIVE", "adminSecret": "cliniflow-admin-secret-2024"}

# 4. Test admin login with new secret
# curl -X POST "http://localhost:5050/api/admin/login" \
#   -H "Content-Type: application/json" \
#   -d '{"email": "admin@clinifly.net", "password": "erhancan123", "clinicCode": "ERHANCAN", "adminSecret": "cliniflow-admin-secret-2024"}'
