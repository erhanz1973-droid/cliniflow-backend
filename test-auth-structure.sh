#!/bin/bash

echo "🔍 TESTING AUTH TOKEN ISSUE"
echo "=================================="

# Test 1: Check if backend is returning proper structure
echo "📋 Test 1: Testing patient login endpoint..."
curl -X POST "https://cliniflow-backend-1.onrender.com/api/login/patient" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@patient.com",
    "password": "password123"
  }' | jq '.'

echo ""
echo "📋 Test 2: Testing admin login endpoint..."
curl -X POST "https://cliniflow-backend-1.onrender.com/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@cliniflow.com",
    "password": "admin123"
  }' | jq '.'

echo ""
echo "📋 Test 3: Testing doctor login endpoint..."
curl -X POST "https://cliniflow-backend-1.onrender.com/api/login/doctor" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@doctor.com",
    "password": "password123"
  }' | jq '.'

echo ""
echo "🔍 ANALYSIS:"
echo "- Check if backend returns 'user' object with 'token' property"
echo "- Check if 'role' field is present and correct"
echo "- Check if 'type' field matches expected values"
echo "- Look for missing fields that could cause auth issues"

echo ""
echo "🎯 EXPECTED STRUCTURE:"
echo '{'
echo '  "ok": true,'
echo '  "user": {'
echo '    "id": "...",'
echo '    "token": "...",'
echo '    "type": "patient|doctor|admin",'
echo '    "role": "PATIENT|DOCTOR|ADMIN",'
echo '    "email": "...",'
echo '    "patientId|doctorId|clinicId": "..."'
echo '  },'
echo '  "token": "..."'
echo '}'
