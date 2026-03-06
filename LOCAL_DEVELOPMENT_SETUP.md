# 🚀 LOCAL DEVELOPMENT SETUP

## 📋 **HEDEF**
Local geliştirme ortamı kur:
- **Backend:** Local (localhost:10000)  
- **Frontend:** Local (localhost:5173)
- **API:** Frontend → Local backend

---

## 🔧 **BACKEND LOCAL AYARLARI**

### **1️⃣ Backend .env Dosyası**
```bash
# cliniflow-backend/server/.env
PORT=10000
JWT_SECRET=cliniflow-secret-key-change-in-production
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_URL=https://swxinrwbylygoqdcbwbt.supabase.co
```

### **2️⃣ Backend Başlatma**
```bash
cd cliniflow-backend
npm install
npm start
# Çalışacak: http://localhost:10000
```

---

## 🌐 **FRONTEND LOCAL AYARLARI**

### **1️⃣ Frontend .env Dosyası**
```bash
# cliniflow-app/.env
VITE_API_URL=http://localhost:10000
```

### **2️⃣ Frontend Başlatma**
```bash
cd cliniflow-app
npm install
npm run dev
# Çalışacak: http://localhost:5173
```

---

## 🔄 **TAM LOCAL ÇALIŞMA SÜRECİ**

### **Adım 1: Backend Başlat**
```bash
# Terminal 1
cd cliniflow-backend
npm start
# ✅ Backend: http://localhost:10000
```

### **Adım 2: Frontend Başlat**  
```bash
# Terminal 2
cd cliniflow-app
npm run dev
# ✅ Frontend: http://localhost:5173
```

### **Adım 3: Test Et**
```bash
# Browser'da
http://localhost:5173
# Admin login test et
```

---

## 📁 **PROJE YAPISI**

```
cliniflow/
├── cliniflow-backend/          # Backend (Node.js)
│   ├── server/
│   │   ├── .env           # PORT=10000
│   │   ├── index.js
│   │   └── package.json
│   └── package.json
├── cliniflow-app/             # Frontend (React)
│   ├── .env              # VITE_API_URL=http://localhost:10000
│   ├── src/
│   ├── package.json
│   └── vite.config.js
└── cliniflow-admin/           # Admin panel (HTML)
    └── public/
        └── admin-login.html
```

---

## 🧪 **TEST ETME**

### **Backend Test:**
```bash
curl http://localhost:10000/health
# Response: {"ok":true,"backend":"real-server","port":10000}
```

### **Frontend Test:**
```bash
# Browser aç
http://localhost:5173
# Admin login dene
```

---

## 🎯 **SONUÇ**

**🚀 Local development ortamı hazır!**

- **Backend:** http://localhost:10000 ✅
- **Frontend:** http://localhost:5173 ✅  
- **API:** Frontend → Local backend ✅

**Artık deploy gerekmeden local geliştirme yapabilirsin!**
