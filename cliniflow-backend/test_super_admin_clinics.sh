# Test super admin clinics endpoint directly
curl -X GET "https://cliniflow-admin.onrender.com/api/super-admin/clinics" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
