# 🚀 CLINIFLOW BACKEND - RENDER DEPLOYMENT GUIDE

## ✅ **PROJECT PREPARATION COMPLETE**

### **✅ Server Structure Ready**
```
/Users/macbookpro/Documents/cliniflow/
├── server/
│   ├── index.js          ✅ Entry point (dotenv at top)
│   ├── package.json      ✅ Created with Node 20.x
│   ├── .env             ✅ Production credentials
│   └── routes/          ✅ API routes
└── public/              ✅ Static files
```

### **✅ Environment Variables Ready**
```bash
JWT_SECRET=cliniflow-secret-key-change-in-production
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_URL=https://swxinrwbylygoqdcbwbt.supabase.co
```

### **✅ Server Configuration**
- **✅ dotenv at top of index.js**
- **✅ process.env.PORT for Render**
- **✅ app.listen(PORT, "0.0.0.0")**
- **✅ No hardcoded localhost URLs**
- **✅ Supabase authentication working**

---

## 🌐 **RENDER WEB SERVICE SETUP**

### **1️⃣ Push to GitHub**
```bash
git add .
git commit -m "Deploy Cliniflow Backend to Render"
git push origin main
```

### **2️⃣ Create Render Web Service**

#### **Render Dashboard Settings:**
- **Service Type:** Web Service
- **Name:** cliniflow-backend
- **Repository:** Your GitHub repo

#### **Build Settings:**
- **Root Directory:** `server`
- **Build Command:** `npm install`
- **Start Command:** `node index.js`
- **Runtime:** `Node 20`

#### **Environment Variables:**
```
JWT_SECRET=cliniflow-secret-key-change-in-production
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eGlucndieWx5Z29xZGNid2J0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDQxNCwiZXhwIjoyMDgzMzA2NDE0fQ.hDrpZu7aaUKP0u3itxAP8SgqhH0ObqsHWn4Rjr3kxko
SUPABASE_URL=https://swxinrwbylygoqdcbwbt.supabase.co
```

---

## 🧪 **PRODUCTION TESTING**

### **After Deploy - Test Endpoints**

#### **Health Check:**
```bash
curl https://YOUR_RENDER_URL/health
```
**Expected:**
```json
{"ok":true,"backend":"real-server","port":5050}
```

#### **Admin Login:**
```bash
curl -X POST https://YOUR_RENDER_URL/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cem@clinifly.net","clinicCode":"CEM","password":"123456"}'
```
**Expected:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "admin": {
    "id": "e1535832-01f4-4fe7-9915-cbc3516852d5",
    "email": "cem@clinifly.net",
    "clinicCode": "CEM"
  }
}
```

---

## 🔄 **FRONTEND UPDATES**

### **Update API_BASE in Production**

#### **admin-login.html:**
```javascript
// Replace
const API = "http://localhost:5050";

// With
const API = "https://YOUR_RENDER_URL";
```

#### **Mobile App (api.ts, secure-fetch.ts):**
```javascript
// Replace
const API_BASE = "http://localhost:5050";

// With
const API_BASE = "https://YOUR_RENDER_URL";
```

---

## ✅ **DEPLOYMENT CHECKLIST**

### **✅ Pre-Deployment**
- [x] server/package.json created
- [x] server/index.js entry point ready
- [x] dotenv.config() at top of index.js
- [x] process.env.PORT configured
- [x] No hardcoded localhost URLs
- [x] Environment variables ready

### **✅ Render Configuration**
- [ ] Root Directory: `server`
- [ ] Build Command: `npm install`
- [ ] Start Command: `node index.js`
- [ ] Runtime: `Node 20`
- [ ] Environment variables set

### **✅ Post-Deployment**
- [ ] Health endpoint accessible
- [ ] Admin login working
- [ ] Supabase connection working
- [ ] CORS allowing frontend domain
- [ ] No console errors
- [ ] Frontend API_BASE updated

---

## 🌐 **EXPECTED FINAL OUTPUT**

### **Public Backend URL:**
`https://cliniflow-backend-1.onrender.com`

### **Health Endpoint:**
`https://cliniflow-backend-1.onrender.com/health`

### **Admin Login Endpoint:**
`https://cliniflow-backend-1.onrender.com/api/admin/login`

---

## 🚀 **DEPLOYMENT STEPS**

### **1️⃣ GitHub Push**
```bash
cd /Users/macbookpro/Documents/cliniflow
git add .
git commit -m "Deploy Cliniflow Backend to Render"
git push origin main
```

### **2️⃣ Render Setup**
1. Go to [Render Dashboard](https://render.com)
2. Click "New +" → "Web Service"
3. Connect GitHub repository
4. Configure settings above
5. Click "Create Web Service"

### **3️⃣ Environment Variables**
1. Go to Service → Environment
2. Add all three environment variables
3. Restart service

### **4️⃣ Test Production**
1. Wait for deployment to complete
2. Test health endpoint
3. Test admin login
4. Update frontend API_BASE

---

**🎯 Backend is ready for Render deployment with Supabase authentication!**
