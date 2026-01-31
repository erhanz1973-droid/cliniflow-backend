# Test suspend endpoint directly
curl -X PATCH "https://cliniflow-admin.onrender.com/api/super-admin/clinics/0c4358c9-e102-4b76-b649-f595319d9d23/suspend" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" \
  -d '{"reason": "Test suspend"}'
