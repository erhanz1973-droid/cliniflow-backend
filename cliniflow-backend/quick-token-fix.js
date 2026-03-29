// HIZLI ÇÖZÜM - Browser Console Manuel Token Set

// 1. Admin login sayfasına git:
// http://localhost:5050/admin-login.html

// 2. Login bilgilerini gir:
// Email: admin@clinifly.net
// Password: erhancan123
// Clinic Code: ERHANCAN

// 3. Login butonuna tıkla

// 4. Browser console'da (F12) şu komutu çalıştır:

localStorage.setItem("admin_token", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbklkIjoxLCJyb2xlIjoiQURNSU4iLCJjbGluaWNDb2RlIjoiRVJIQU5DQU4iLCJpYXQiOjE3NzA1NTAzMzQsImV4cCI6MTc3MTE1NTEzNH0.7BYcSuYqWhBNR6oWJ8roDZHDQ92defSTgOhtoe5Z9Dk");

// 5. Admin panel'e git:
// http://localhost:5050/admin-doctor-applications.html

// 6. Sayfayı refresh et (F5 veya refresh butonu)

// 7. Console'da kontrol et:
console.log("Token:", localStorage.getItem("admin_token"));

// 8. Eğer hala çalışmazsa:
// - Browser'ı kapatıp yeniden aç
// - Cache temizle
// - F12 developer tools'ta Application sekmesinde LocalStorage kontrol et
