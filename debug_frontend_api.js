// Debug script to check frontend API_BASE and endpoint calls
// Run this in browser console on admin dashboard

console.log("=== FRONTEND API DEBUG ===");

// 1️⃣ Check API_BASE
console.log("API_BASE:", typeof API !== 'undefined' ? API : 'API not defined');

// 2️⃣ Check token
console.log("Admin Token:", localStorage.getItem("adminToken") ? "EXISTS" : "MISSING");

// 3️⃣ Test treatment creation endpoint
async function testTreatmentCreate() {
  try {
    const token = localStorage.getItem("adminToken");
    const API_BASE = typeof API !== 'undefined' ? API : 'http://localhost:5050';
    
    console.log("Testing treatment creation...");
    console.log("API_BASE:", API_BASE);
    
    // Sample payload - replace with actual values
    const testPayload = {
      patient_id: "00000000-0000-0000-0000-000000000001",
      doctor_id: "00000000-0000-0000-0000-000000000002", 
      type: "cleaning",
      notes: "Test treatment from debug script",
      items: []
    };
    
    console.log("Test Payload:", testPayload);
    
    const response = await fetch(`${API_BASE}/api/admin/treatments-v2`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(testPayload)
    });
    
    console.log("Response Status:", response.status);
    console.log("Response Headers:", Object.fromEntries(response.headers.entries()));
    
    const responseData = await response.json();
    console.log("Response Data:", responseData);
    
    if (response.status === 500) {
      console.error("🚨 SERVER ERROR - Check backend logs for details");
    } else if (response.status === 400) {
      console.error("🚨 BAD REQUEST - Check payload format");
    } else if (response.status === 200 || response.status === 201) {
      console.log("✅ SUCCESS - Treatment created");
    }
    
  } catch (error) {
    console.error("🚨 NETWORK ERROR:", error);
  }
}

// 4️⃣ Auto-run test
testTreatmentCreate();

// 5️⃣ Manual test function
window.testTreatmentCreate = testTreatmentCreate;
console.log("💡 Run window.testTreatmentCreate() to test again");
