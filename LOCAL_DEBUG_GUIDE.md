# 🔍 LOCAL DEBUGGING GUIDE

## ❌ **SORUN ANALİZİ**

**Kullanıcı Test:**
- Email: `test@test.com`
- Clinic Code: `TEST`
- Password: `***`

**Sonuç:** 401 Unauthorized

**Console Log:**
```
[LOGIN] Using API: http://localhost:5050
```

**Problem:** API variable hâlâ eski port'u gösteriyor (5050)

---

## 🔧 **ÇÖZÜM ÖNERİLERİ**

### **1️⃣ Browser Cache Temizliği**
```bash
# Frontend'te
cd cliniflow-app
rm -rf .vite
npm run dev
```

### **2️⃣ Environment Variable Kontrolü**
```javascript
// Console'da manuel kontrol
console.log("VITE_API_URL:", import.meta.env.VITE_API_URL);
console.log("API_BASE:", API_BASE);
```

### **3️⃣ Hardcoded URL Araması**
```bash
# Frontend'te 5050 ara
grep -r "5050" src/
```

### **4️⃣ Network Tab Kontrolü**
- F12 → Network
- `/api/admin/login` isteğinin URL'sini kontrol et
- `http://localhost:5050` mi, `http://localhost:10000` mi?

---

## 🎯 **TEST ETME**

### **Doğru Credentials:**
```
Email: cem@clinifly.net
Clinic Code: CEM
Password: 123456
```

### **Beklenen Console Log:**
```
[LOGIN] Using API: http://localhost:10000
[LOGIN CREDENTIALS: { email: "cem@clinifly.net", clinicCode: "CEM", password: "***" }
ABOUT TO FETCH http://localhost:10000/api/admin/login
LOGIN RESPONSE STATUS: 200
LOGIN RESPONSE JSON: { ok: true, token: "...", admin: {...} }
```

---

## ✅ **BAŞARILI TEST İÇİN**

1. **Browser cache temizle**
2. **Frontend restart et**
3. **Console loglarını kontrol et**
4. **Doğru credentials kullan**
5. **Network tab'da URL'yi doğrula**

**Eğer hâlâ 5050 görüyorsanız, environment variable yüklenmiyordur.**
