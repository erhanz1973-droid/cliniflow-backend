// Admin panel token storage sorunu için nihai çözüm:

// SORUN:
// 1. Admin login oluyor ama token localStorage'de saklanmıyor
// 2. Admin panel'e gidince 401 Unauthorized hatası alıyor
// 3. Debug logları gösteriyor ama token storage çalışmıyor

// ÇÖZÜM ADIMLARI:

// 1. Admin login sayfasında token storage'ı kontrol et:
//    - localStorage.setItem('admin_token', json.token) çalışıyor mu?
//    - Browser console'da "Token saved to localStorage" mesajı var mı?

// 2. Admin panel sayfasında token storage'ı kontrol et:
//    - localStorage.getItem('admin_token') null mı dönüyor?
//    - Browser console'da "Token from localStorage: missing" mi görünüyor?

// 3. Browser localStorage kontrolü:
//    - F12 developer tools aç
//    - Application sekmesi
//    - LocalStorage bölümünde admin_token var mı?
//    - Storage boyutu ve değeri kontrol et

// 4. Manuel test:
//    - Admin login ol
//    - Token'ı kopyala
//    - Browser console'da: localStorage.setItem('admin_token', '[TOKEN]')
//    - Admin panel'e git

// 5. Alternative çözüm:
//    - Session storage kullan
//    - Cookie kullan
//    - URL parameter ile token taşı

// DEBUG SCRIPT:
localStorage.setItem('admin_token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZG1pbklkIjoxLCJyb2xlIjoiQURNSU4iLCJjbGluaWNDb2RlIjoiRVJIQU5DQU4iLCJpYXQiOjE3NzA1NTAzMzQsImV4cCI6MTc3MTE1NTEzNH0.7BYcSuYqWhBNR6oWJ8roDZHDQ92defSTgOhtoe5Z9Dk');

// Test et:
console.log('Manual token set:', localStorage.getItem('admin_token'));
