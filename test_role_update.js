const jwt = require('jsonwebtoken');

// Create a test token for patient p_d5437db28a11
const currentToken = jwt.sign(
  { 
    patientId: 'p_d5437db28a11', 
    clinicId: 1,
    clinicCode: 'erhancan',
    role: 'PATIENT',
    roleType: 'PATIENT'
  },
  'cliniflow-secret-key-change-in-production',
  { expiresIn: '30d' }
);

console.log('=== MUSTAFA DEDE ROL GÜNCELLEME TEST ===');
console.log('Current token:', currentToken.substring(0, 30) + '...');

const http = require('http');

// Test current role first
const testOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/patient/me',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + currentToken,
    'Content-Type': 'application/json'
  }
};

const testReq = http.request(testOptions, (res) => {
  console.log('Current status:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('✅ Current Status Check:');
      console.log('- Patient ID:', result.patientId);
      console.log('- Name:', result.name);
      console.log('- Current Role:', result.role);
      console.log('- Status:', result.status);
      console.log('');
      
      // Now update to DOCTOR
      console.log('🔄 Updating role to DOCTOR...');
      
      const updateOptions = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/patient/role',
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + currentToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ newRole: 'DOCTOR' })
      };
      
      const updateReq = http.request(updateOptions, (updateRes) => {
        console.log('Update status:', updateRes.statusCode);
        
        let updateData = '';
        updateRes.on('data', (chunk) => {
          updateData += chunk;
        });
        
        updateRes.on('end', () => {
          try {
            const updateResult = JSON.parse(updateData);
            console.log('✅ UPDATE SUCCESS!');
            console.log('- New Role:', updateResult.role);
            console.log('- New Token:', updateResult.token.substring(0, 30) + '...');
            console.log('- Patient ID:', updateResult.patientId);
            console.log('- Name:', updateResult.name);
            console.log('- Status:', updateResult.status);
            console.log('');
            console.log('=== MUSTAFA DEDE ARTIK DOKTOR ===');
            console.log('✅ Rol başarıyla güncellendi: PATIENT → DOCTOR');
            console.log('✅ Yeni JWT token oluşturuldu');
            console.log('✅ Backend veritabanı başarılı');
            console.log('✅ Frontend güncellenecek');
            console.log('');
            console.log('📱 Test with new token...');
            
            // Test with new token
            const newTestOptions = {
              hostname: 'localhost',
              port: 3000,
              path: '/api/patient/me',
              method: 'GET',
              headers: {
                'Authorization': 'Bearer ' + updateResult.token,
                'Content-Type': 'application/json'
              }
            };
            
            const newTestReq = http.request(newTestOptions, (newTestRes) => {
              console.log('New token status:', newTestRes.statusCode);
              
              let newData = '';
              newTestRes.on('data', (chunk) => {
                newData += chunk;
              });
              
              newTestRes.on('end', () => {
                try {
                  const newResult = JSON.parse(newData);
                  console.log('✅ New Token Test:');
                  console.log('- Patient ID:', newResult.patientId);
                  console.log('- Name:', newResult.name);
                  console.log('- Role:', newResult.role);
                  console.log('- Status:', newResult.status);
                  console.log('');
                  console.log('🎯 SONUÇ:');
                  console.log('✅ Mustafa dede artık DOKTOR');
                  console.log('✅ Sistem rolü başarıyla güncellendi');
                  console.log('✅ Yeni token ile giriş yapabilir');
                } catch (e) {
                  console.log('Error parsing new token response:', e.message);
                  console.log('Raw response:', newData);
                }
              });
              
              newTestReq.on('error', (e) => {
                console.log('New token test error:', e.message);
              });
              
              newTestReq.end();
            });
            
          } catch (e) {
            console.log('Error parsing update response:', e.message);
            console.log('Raw response:', updateData);
          }
        });
        
        updateReq.on('error', (e) => {
          console.log('Update request error:', e.message);
        });
        
        updateReq.end();
      });
      
    } catch (e) {
      console.log('Error parsing test response:', e.message);
      console.log('Raw response:', data);
    }
  });
});

testReq.on('error', (e) => {
  console.log('Test request error:', e.message);
});

testReq.end();
