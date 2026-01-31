// Supabase client and helper functions
// Conditionally require @supabase/supabase-js to prevent MODULE_NOT_FOUND errors
let createClient = null;
try {
  const supabaseModule = require("@supabase/supabase-js");
  createClient = supabaseModule.createClient;
} catch (error) {
  console.warn("[SUPABASE] ⚠️  @supabase/supabase-js package not found. Supabase features will be disabled.");
  console.warn("[SUPABASE] Install with: npm install @supabase/supabase-js");
}

// Get Supabase credentials from environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Create Supabase client with service role key (bypasses RLS)
let supabase = null;
if (createClient && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    console.log("[SUPABASE] ✅ Supabase client initialized");
  } catch (error) {
    console.error("[SUPABASE] ❌ Failed to initialize Supabase client:", error.message);
    console.warn("[SUPABASE] ⚠️  Using file-based storage as fallback.");
  }
} else {
  if (!createClient) {
    console.warn("[SUPABASE] ⚠️  @supabase/supabase-js not available. Using file-based storage.");
  } else if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[SUPABASE] ⚠️  Supabase credentials not found. Using file-based storage.");
    console.warn("[SUPABASE] Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables to enable Supabase.");
  }
}

// Helper function to check if Supabase is available
function isSupabaseAvailable() {
  return supabase !== null;
}

// ================== CLINICS ==================
async function getClinicByCode(clinicCode) {
  if (!isSupabaseAvailable()) return null;
  try {
    const codeUpper = String(clinicCode).trim().toUpperCase();
    console.log(`[SUPABASE] Looking up clinic with code: "${codeUpper}"`);
    const { data, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("clinic_code", codeUpper)
      .single();
    if (error) {
      console.error(`[SUPABASE] Error getting clinic "${codeUpper}":`, error);
      // If error is "PGRST116" (no rows returned), that's expected for non-existent clinics
      if (error.code === "PGRST116") {
        console.log(`[SUPABASE] Clinic "${codeUpper}" not found in database`);
      }
      return null;
    }
    if (data) {
      console.log(`[SUPABASE] ✅ Found clinic "${codeUpper}" in Supabase:`, { 
        id: data.id, 
        name: data.name, 
        clinic_code: data.clinic_code,
        address: data.address || "empty",
        phone: data.phone || "empty",
        logo_url: data.logo_url || "empty",
        website: data.website || "empty",
      });
    }
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception getting clinic:", error);
    return null;
  }
}

async function getAllClinics() {
  if (!isSupabaseAvailable()) {
    console.log("[SUPABASE] getAllClinics: Supabase not available");
    return {};
  }
  try {
    console.log("[SUPABASE] getAllClinics: Fetching all clinics from Supabase...");
    const { data, error } = await supabase.from("clinics").select("*");
    if (error) {
      console.error("[SUPABASE] Error getting all clinics:", error);
      return {};
    }
    console.log(`[SUPABASE] getAllClinics: Received ${data?.length || 0} clinic(s) from Supabase`);
    // Convert array to object with clinic_code as key
    const clinicsObj = {};
    if (data) {
      data.forEach((clinic) => {
        const code = clinic.clinic_code ? String(clinic.clinic_code).toUpperCase() : null;
        if (code) {
          clinicsObj[code] = clinic;
          console.log(`[SUPABASE] getAllClinics: Added clinic "${code}" to result`);
        } else {
          console.warn(`[SUPABASE] getAllClinics: Skipping clinic with null/empty clinic_code:`, clinic);
        }
      });
    }
    console.log(`[SUPABASE] getAllClinics: Returning ${Object.keys(clinicsObj).length} clinic(s):`, Object.keys(clinicsObj));
    return clinicsObj;
  } catch (error) {
    console.error("[SUPABASE] Exception getting all clinics:", error);
    return {};
  }
}

async function createClinic(clinicData) {
  if (!isSupabaseAvailable()) {
    console.log("[SUPABASE] createClinic: Supabase not available");
    return null;
  }
  try {
    console.log(`[SUPABASE] Creating clinic in Supabase:`, {
      clinic_code: clinicData.clinic_code,
      name: clinicData.name || "empty",
      email: clinicData.email || "empty",
      address: clinicData.address || "empty",
      phone: clinicData.phone || "empty",
      logo_url: clinicData.logo_url || "empty",
      website: clinicData.website || "empty",
    });
    const { data, error } = await supabase
      .from("clinics")
      .insert([clinicData])
      .select()
      .single();
    if (error) {
      console.error("[SUPABASE] ❌ Error creating clinic:", error);
      console.error("[SUPABASE] Error code:", error.code);
      console.error("[SUPABASE] Error message:", error.message);
      console.error("[SUPABASE] Error details:", JSON.stringify(error, null, 2));
      console.error("[SUPABASE] Clinic data was:", JSON.stringify(clinicData, null, 2));
      return null;
    }
    if (data) {
      console.log(`[SUPABASE] ✅ Successfully created clinic "${clinicData.clinic_code}" in Supabase`);
      console.log(`[SUPABASE] Created clinic data:`, {
        clinic_code: data.clinic_code,
        name: data.name || "empty",
        address: data.address || "empty",
        phone: data.phone || "empty",
        logo_url: data.logo_url || "empty",
        website: data.website || "empty",
      });
    }
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception creating clinic:", error);
    console.error("[SUPABASE] Exception details:", error?.message, error?.stack);
    return null;
  }
}

async function updateClinic(clinicCode, updates) {
  if (!isSupabaseAvailable()) return null;
  try {
    // 🔒 UPDATE sırasında unique alanları koru
    const { clinic_code, ...safeUpdates } = updates;
    
    console.log(`[SUPABASE] Updating clinic "${clinicCode}" with data:`, {
      name: safeUpdates.name,
      address: safeUpdates.address || "empty",
      phone: safeUpdates.phone || "empty",
      logo_url: safeUpdates.logo_url || "empty",
      website: safeUpdates.website || "empty",
    });
    const { data, error } = await supabase
      .from("clinics")
      .update(safeUpdates)
      .eq("clinic_code", clinicCode.toUpperCase())
      .select()
      .single();
    if (error) {
      console.error("[SUPABASE] ❌ Error updating clinic:", error);
      console.error("[SUPABASE] Error code:", error.code);
      console.error("[SUPABASE] Error message:", error.message);
      console.error("[SUPABASE] Error details:", JSON.stringify(error, null, 2));
      console.error("[SUPABASE] Update payload was:", JSON.stringify(updates, null, 2));
      return null;
    }
    if (!data) {
      console.error(`[SUPABASE] ❌ Update succeeded but no data returned for clinic "${clinicCode}"`);
      console.error("[SUPABASE] This might mean the clinic doesn't exist or RLS is blocking the update");
      return null;
    }
    console.log(`[SUPABASE] ✅ Successfully updated clinic "${clinicCode}"`);
    console.log(`[SUPABASE] Returned data:`, {
      name: data.name,
      address: data.address || "empty",
      phone: data.phone || "empty",
      logo_url: data.logo_url || "empty",
      website: data.website || "empty",
    });
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception updating clinic:", error);
    console.error("[SUPABASE] Exception details:", error?.message, error?.stack);
    return null;
  }
}

async function upsertClinic(clinicData) {
  if (!isSupabaseAvailable()) {
    console.log("[SUPABASE] upsertClinic: Supabase not available");
    return null;
  }
  try {
    console.log(`[SUPABASE] Upserting clinic in Supabase:`, {
      clinic_code: clinicData.clinic_code || "MISSING!",
      name: clinicData.name || "empty",
      email: clinicData.email || "empty",
      address: clinicData.address || "empty",
      phone: clinicData.phone || "empty",
      logo_url: clinicData.logo_url || "empty",
      website: clinicData.website || "empty",
    });
    
    // Ensure clinic_code is present and uppercase
    if (!clinicData.clinic_code) {
      console.error("[SUPABASE] ❌ upsertClinic: clinic_code is missing!");
      console.error("[SUPABASE] Clinic data:", JSON.stringify(clinicData, null, 2));
      return null;
    }
    
    // Ensure all required fields are present with explicit defaults
    // This ensures that phone, address, website, logo_url are always saved (even if empty string)
    const completeClinicData = {
      clinic_code: String(clinicData.clinic_code).toUpperCase(),
      name: String(clinicData.name || ""),
      email: String(clinicData.email || ""),
      password: String(clinicData.password || ""), // Required field
      address: String(clinicData.address || ""), // Explicitly set, even if empty
      phone: String(clinicData.phone || ""), // Explicitly set, even if empty
      website: String(clinicData.website || ""), // Explicitly set, even if empty
      logo_url: String(clinicData.logo_url || ""), // Explicitly set, even if empty
      google_maps_url: String(clinicData.google_maps_url || ""),
      default_inviter_discount_percent: clinicData.default_inviter_discount_percent !== undefined ? clinicData.default_inviter_discount_percent : null,
      default_invited_discount_percent: clinicData.default_invited_discount_percent !== undefined ? clinicData.default_invited_discount_percent : null,
      google_reviews: Array.isArray(clinicData.google_reviews) ? clinicData.google_reviews : [],
      trustpilot_reviews: Array.isArray(clinicData.trustpilot_reviews) ? clinicData.trustpilot_reviews : [],
      created_at: clinicData.created_at || Date.now(),
      updated_at: clinicData.updated_at || Date.now(),
    };
    
    console.log(`[SUPABASE] Complete clinic data for upsert:`, {
      clinic_code: completeClinicData.clinic_code,
      name: completeClinicData.name,
      address: completeClinicData.address || "empty string",
      phone: completeClinicData.phone || "empty string",
      website: completeClinicData.website || "empty string",
      logo_url: completeClinicData.logo_url || "empty string",
    });
    console.log(`[SUPABASE] Full payload (JSON):`, JSON.stringify(completeClinicData, null, 2));
    
    // Try using RPC (stored procedure) first if available, otherwise fall back to upsert
    try {
      // Check if stored procedure exists by trying to call it
      const { data: rpcData, error: rpcError } = await supabase.rpc('upsert_clinic', {
        p_clinic_code: completeClinicData.clinic_code,
        p_name: completeClinicData.name,
        p_email: completeClinicData.email,
        p_password: completeClinicData.password,
        p_address: completeClinicData.address,
        p_phone: completeClinicData.phone,
        p_website: completeClinicData.website,
        p_logo_url: completeClinicData.logo_url,
        p_google_maps_url: completeClinicData.google_maps_url,
        p_default_inviter_discount_percent: completeClinicData.default_inviter_discount_percent,
        p_default_invited_discount_percent: completeClinicData.default_invited_discount_percent,
        p_google_reviews: completeClinicData.google_reviews,
        p_trustpilot_reviews: completeClinicData.trustpilot_reviews,
        p_created_at: completeClinicData.created_at,
        p_updated_at: completeClinicData.updated_at,
      });
      
      if (!rpcError && rpcData && rpcData.length > 0) {
        console.log("[SUPABASE] ✅ Used stored procedure (upsert_clinic)");
        const result = rpcData[0];
        console.log("[SUPABASE] ✅ clinics upsert ok (via RPC):", {
          clinic_code: result.clinic_code,
          name: result.name || "empty",
          address: result.address || "empty",
          phone: result.phone || "empty",
          logo_url: result.logo_url || "empty",
          website: result.website || "empty",
        });
        return result;
      } else if (rpcError && rpcError.code !== '42883') {
        // 42883 = function does not exist, which is OK - we'll fall back to upsert
        console.warn("[SUPABASE] ⚠️  RPC error (will try upsert):", rpcError.message);
      }
    } catch (rpcException) {
      // Stored procedure doesn't exist or other error - fall back to upsert
      console.log("[SUPABASE] Stored procedure not available, using upsert method");
    }
    
    // Fallback to manual UPDATE method (more reliable than upsert)
    console.log("[SUPABASE] Using manual UPDATE method...");
    
    // First, check if clinic exists
    const existing = await supabase
      .from("clinics")
      .select("clinic_code")
      .eq("clinic_code", completeClinicData.clinic_code)
      .single();
    
    if (existing.error && existing.error.code === "PGRST116") {
      // Clinic doesn't exist, use INSERT
      console.log("[SUPABASE] Clinic doesn't exist, using INSERT...");
      const { data: insertData, error: insertError } = await supabase
        .from("clinics")
        .insert([completeClinicData])
        .select()
        .single();
      
      if (insertError) {
        console.error("[SUPABASE] ❌ INSERT error:", insertError);
        console.error("[SUPABASE] Error details:", JSON.stringify(insertError, null, 2));
        return null;
      }
      
      console.log("[SUPABASE] ✅ INSERT successful:", {
        clinic_code: insertData.clinic_code,
        name: insertData.name || "empty",
        address: insertData.address || "empty",
        phone: insertData.phone || "empty",
      });
      return insertData;
    } else {
      // Clinic exists, use UPDATE with explicit field mapping
      console.log("[SUPABASE] Clinic exists, using UPDATE with explicit fields...");
      const { data: updateData, error: updateError } = await supabase
        .from("clinics")
        .update({
          name: completeClinicData.name,
          email: completeClinicData.email,
          password: completeClinicData.password,
          address: completeClinicData.address, // Explicitly set
          phone: completeClinicData.phone, // Explicitly set
          website: completeClinicData.website, // Explicitly set
          logo_url: completeClinicData.logo_url, // Explicitly set
          google_maps_url: completeClinicData.google_maps_url,
          default_inviter_discount_percent: completeClinicData.default_inviter_discount_percent,
          default_invited_discount_percent: completeClinicData.default_invited_discount_percent,
          google_reviews: completeClinicData.google_reviews,
          trustpilot_reviews: completeClinicData.trustpilot_reviews,
          updated_at: completeClinicData.updated_at,
        })
        .eq("clinic_code", completeClinicData.clinic_code)
        .select()
        .single();
      
      if (updateError) {
        console.error("[SUPABASE] ❌ UPDATE error:", updateError);
        console.error("[SUPABASE] Error code:", updateError.code);
        console.error("[SUPABASE] Error message:", updateError.message);
        console.error("[SUPABASE] Error details:", JSON.stringify(updateError, null, 2));
        console.error("[SUPABASE] Update payload was:", JSON.stringify({
          name: completeClinicData.name,
          address: completeClinicData.address,
          phone: completeClinicData.phone,
          website: completeClinicData.website,
          logo_url: completeClinicData.logo_url,
        }, null, 2));
        return null;
      }
      
      if (updateData) {
        console.log("[SUPABASE] ✅ UPDATE successful:", {
          clinic_code: updateData.clinic_code,
          name: updateData.name || "empty",
          address: updateData.address || "empty",
          phone: updateData.phone || "empty",
          logo_url: updateData.logo_url || "empty",
          website: updateData.website || "empty",
        });
        console.log("[SUPABASE] Full returned data:", JSON.stringify(updateData, null, 2));
        return updateData;
      } else {
        console.error("[SUPABASE] ❌ UPDATE returned no data!");
        return null;
      }
    }
  } catch (error) {
    console.error("[SUPABASE] Exception upserting clinic:", error);
    console.error("[SUPABASE] Exception details:", error?.message, error?.stack);
    return null;
  }
}

// ================== PATIENTS ==================
async function getPatientById(patientId) {
  if (!isSupabaseAvailable()) return null;
  try {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("patient_id", patientId)
      .single();
    if (error) {
      console.error("[SUPABASE] Error getting patient:", error);
      return null;
    }
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception getting patient:", error);
    return null;
  }
}

async function getPatientsByClinicCode(clinicCode) {
  if (!isSupabaseAvailable()) return [];
  try {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("clinic_code", clinicCode.toUpperCase());
    if (error) {
      console.error("[SUPABASE] Error getting patients by clinic:", error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error("[SUPABASE] Exception getting patients by clinic:", error);
    return [];
  }
}

async function createPatient(patientData) {
  if (!isSupabaseAvailable()) {
    console.log("[SUPABASE] createPatient: Supabase not available");
    return null;
  }
  try {
    console.log(`[SUPABASE] Creating patient in Supabase:`, {
      patient_id: patientData.patient_id,
      name: patientData.name || "empty",
      phone: patientData.phone || "empty",
      clinic_code: patientData.clinic_code,
      status: patientData.status,
    });
    const { data, error } = await supabase
      .from("patients")
      .insert([patientData])
      .select()
      .single();
    if (error) {
      console.error("[SUPABASE] ❌ Error creating patient:", error);
      console.error("[SUPABASE] Error code:", error.code);
      console.error("[SUPABASE] Error message:", error.message);
      console.error("[SUPABASE] Error details:", JSON.stringify(error, null, 2));
      console.error("[SUPABASE] Patient data was:", JSON.stringify(patientData, null, 2));
      return null;
    }
    if (data) {
      console.log(`[SUPABASE] ✅ Successfully created patient "${patientData.patient_id}" in Supabase`);
      console.log(`[SUPABASE] Created patient data:`, {
        patient_id: data.patient_id,
        name: data.name || "empty",
        phone: data.phone || "empty",
        clinic_code: data.clinic_code,
        status: data.status,
      });
    }
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception creating patient:", error);
    console.error("[SUPABASE] Exception details:", error?.message, error?.stack);
    return null;
  }
}

async function updatePatient(patientId, updates) {
  if (!isSupabaseAvailable()) {
    console.log("[SUPABASE] updatePatient: Supabase not available");
    return null;
  }
  try {
    console.log(`[SUPABASE] Updating patient "${patientId}" with data:`, {
      name: updates.name || "empty",
      phone: updates.phone || "empty",
      status: updates.status,
      clinic_code: updates.clinic_code,
    });
    const { data, error } = await supabase
      .from("patients")
      .update(updates)
      .eq("patient_id", patientId)
      .select()
      .single();
    if (error) {
      console.error("[SUPABASE] ❌ Error updating patient:", error);
      console.error("[SUPABASE] Error code:", error.code);
      console.error("[SUPABASE] Error message:", error.message);
      console.error("[SUPABASE] Error details:", JSON.stringify(error, null, 2));
      console.error("[SUPABASE] Update payload was:", JSON.stringify(updates, null, 2));
      return null;
    }
    if (!data) {
      console.error(`[SUPABASE] ❌ Update succeeded but no data returned for patient "${patientId}"`);
      console.error("[SUPABASE] This might mean the patient doesn't exist or RLS is blocking the update");
      return null;
    }
    console.log(`[SUPABASE] ✅ Successfully updated patient "${patientId}"`);
    console.log(`[SUPABASE] Returned data:`, {
      patient_id: data.patient_id,
      name: data.name || "empty",
      phone: data.phone || "empty",
      status: data.status,
      clinic_code: data.clinic_code,
    });
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception updating patient:", error);
    console.error("[SUPABASE] Exception details:", error?.message, error?.stack);
    return null;
  }
}

// ================== PATIENT TOKENS ==================
async function getPatientToken(token) {
  if (!isSupabaseAvailable()) return null;
  try {
    const { data, error } = await supabase
      .from("patient_tokens")
      .select("*")
      .eq("token", token)
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        // Not found
        return null;
      }
      console.error("[SUPABASE] Error getting patient token:", error);
      return null;
    }
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception getting patient token:", error);
    return null;
  }
}

async function createPatientToken(tokenData) {
  if (!isSupabaseAvailable()) return null;
  try {
    const { data, error } = await supabase
      .from("patient_tokens")
      .insert([tokenData])
      .select()
      .single();
    if (error) {
      console.error("[SUPABASE] Error creating patient token:", error);
      return null;
    }
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception creating patient token:", error);
    return null;
  }
}

async function updatePatientTokenRole(token, role) {
  if (!isSupabaseAvailable()) return null;
  try {
    // Patient tokens table doesn't have a role column, but we can update expires_at
    // For now, we'll just return success
    // In the future, we might add a role column or use a separate table
    return true;
  } catch (error) {
    console.error("[SUPABASE] Exception updating patient token role:", error);
    return null;
  }
}

async function updatePatientTokensByPatientId(patientId, updates) {
  if (!isSupabaseAvailable()) return null;
  try {
    const { data, error } = await supabase
      .from("patient_tokens")
      .update(updates)
      .eq("patient_id", patientId)
      .select();
    if (error) {
      console.error("[SUPABASE] Error updating patient tokens by patientId:", error);
      return null;
    }
    return data;
  } catch (error) {
    console.error("[SUPABASE] Exception updating patient tokens by patientId:", error);
    return null;
  }
}

module.exports = {
  isSupabaseAvailable,
  getClinicByCode,
  getAllClinics,
  createClinic,
  updateClinic,
  upsertClinic,
  getPatientById,
  getPatientsByClinicCode,
  createPatient,
  updatePatient,
  getPatientToken,
  createPatientToken,
  updatePatientTokenRole,
  updatePatientTokensByPatientId,
  // Export Supabase client for direct use
  getSupabaseClient: () => supabase,
};

