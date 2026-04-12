// Admin panel token storage test script:

// 1. Browser console'da çalıştır:
localStorage.clear();

// 2. Login sayfasına git:
// http://localhost:5050/admin-login.html

// 3. Login bilgilerini gir:
// Email: admin@clinifly.net
// Password: erhancan123
// Clinic Code: ERHANCAN

// 4. Login sonrası kontrol et:
console.log("Token check:", localStorage.getItem("admin_token"));
console.log("Clinic code:", localStorage.getItem("clinic_code"));

// 5. Admin panel'e git:
// http://localhost:5050/admin-doctor-applications.html

// 6. Console loglarını izle:
// - "[LOGIN] Token saved to localStorage: ..."
// - "[ADMIN] Token from localStorage: exists"
// - "[ADMIN] Making request with token: ..."

// 7. Eğer token yoksa:
// - Browser'da localStorage'i kontrol et
// - Token'ı manuel olarak set et:
// localStorage.setItem("admin_token", "[TOKEN_BURAYA]");

// 8. Manuel token test:
// - Admin login'den gelen token'ı kopyala
// - Console'da manuel set et
// - Sayfayı refresh et
