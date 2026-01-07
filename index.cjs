const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

// Conditionally require supabase (optional - falls back to file-based storage)
let supabase = null;
try {
  supabase = require("./supabase");
} catch (error) {
  console.warn("[INIT] ⚠️  Supabase module not found. Using file-based storage.");
  // Create a fallback object with stub functions
  supabase = {
    isSupabaseAvailable: () => false,
    getClinicByCode: async () => null,
    getAllClinics: async () => ({}),
    createClinic: async () => null,
    updateClinic: async () => null,
    getPatientById: async () => null,
    getPatientsByClinicCode: async () => [],
    createPatient: async () => null,
    updatePatient: async () => null,
  };
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ? Number(process.env.PORT) : 5050;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "cliniflow-secret-key-change-in-production";
const JWT_EXPIRES_IN = "30d"; // 30 days

// ================== MIDDLEWARE ==================
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public"))); // /admin.html

// ================== STORAGE ==================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const REG_FILE = path.join(DATA_DIR, "registrations.json");
const TOK_FILE = path.join(DATA_DIR, "tokens.json");
const PAT_FILE = path.join(DATA_DIR, "patients.json");
const REF_FILE = path.join(DATA_DIR, "referrals.json");
const REF_EVENT_FILE = path.join(DATA_DIR, "referralEvents.json");
const CLINIC_FILE = path.join(DATA_DIR, "clinic.json");
const CLINICS_FILE = path.join(DATA_DIR, "clinics.json"); // Admin clinics (email/password)
const ADMIN_TOKENS_FILE = path.join(DATA_DIR, "adminTokens.json"); // JWT tokens
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl"); // Analytics events (JSON Lines)

// ================== INITIALIZE CLINICS.JSON ==================
// Migrate clinic.json to clinics.json if clinics.json doesn't exist or is empty
// This runs on every server start to handle Render's ephemeral filesystem
(function initializeClinicsJson() {
  try {
    console.log(`[INIT] ========== INITIALIZING CLINICS.JSON ==========`);
    console.log(`[INIT] CLINICS_FILE path: ${CLINICS_FILE}`);
    console.log(`[INIT] CLINICS_FILE exists: ${fs.existsSync(CLINICS_FILE)}`);
    console.log(`[INIT] CLINIC_FILE path: ${CLINIC_FILE}`);
    console.log(`[INIT] CLINIC_FILE exists: ${fs.existsSync(CLINIC_FILE)}`);
    
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log(`[INIT] Creating data directory: ${DATA_DIR}`);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    const clinics = readJson(CLINICS_FILE, {});
    const clinic = readJson(CLINIC_FILE, {});
    
    console.log(`[INIT] clinics.json keys:`, Object.keys(clinics));
    console.log(`[INIT] clinic.json clinicCode:`, clinic.clinicCode);
    
    let needsWrite = false;
    
    // Always ensure clinic.json's clinic is in clinics.json (if clinic.json exists)
    if (clinic.clinicCode) {
      const clinicCode = String(clinic.clinicCode).toUpperCase().trim();
      if (!clinics[clinicCode]) {
        console.log(`[INIT] Adding clinic.json clinic "${clinicCode}" to clinics.json...`);
        clinics[clinicCode] = {
          ...clinic,
          clinicCode: clinicCode,
        };
        needsWrite = true;
      } else {
        console.log(`[INIT] Clinic "${clinicCode}" already exists in clinics.json`);
      }
    }
    
    // If clinics.json is empty and clinic.json has no data, create empty clinics.json
    if (Object.keys(clinics).length === 0 && !clinic.clinicCode) {
      console.log(`[INIT] Creating empty clinics.json file...`);
      needsWrite = true;
    } else if (Object.keys(clinics).length > 0) {
      console.log(`[INIT] clinics.json already exists with ${Object.keys(clinics).length} clinic(s):`, Object.keys(clinics));
    }
    
    // Write clinics.json if needed
    if (needsWrite) {
      try {
        writeJson(CLINICS_FILE, clinics);
        console.log(`[INIT] ✅ Wrote clinics.json file`);
        
        // Verify the write
        const verifyExists = fs.existsSync(CLINICS_FILE);
        const verifyClinics = readJson(CLINICS_FILE, {});
        console.log(`[INIT] Verified clinics.json exists: ${verifyExists}`);
        console.log(`[INIT] Verified clinics.json keys:`, Object.keys(verifyClinics));
        
        if (clinic.clinicCode) {
          const clinicCode = String(clinic.clinicCode).toUpperCase().trim();
          if (verifyClinics[clinicCode]) {
            console.log(`[INIT] ✅ Verification successful: clinic "${clinicCode}" exists in clinics.json`);
          } else {
            console.error(`[INIT] ❌ Verification failed: clinic "${clinicCode}" NOT found in clinics.json!`);
          }
        }
      } catch (writeError) {
        console.error(`[INIT] ❌ Failed to write clinics.json:`, writeError);
        console.error(`[INIT] Write error details:`, {
          message: writeError.message,
          stack: writeError.stack,
          path: CLINICS_FILE,
          dataDirExists: fs.existsSync(DATA_DIR),
          dataDirWritable: fs.accessSync ? (() => {
            try {
              fs.accessSync(DATA_DIR, fs.constants.W_OK);
              return true;
            } catch {
              return false;
            }
          })() : 'unknown',
        });
      }
    }
    
    console.log(`[INIT] ========== END INITIALIZATION ==========`);
  } catch (error) {
    console.error(`[INIT] ❌ Initialization error:`, error);
    console.error(`[INIT] Error details:`, {
      message: error.message,
      stack: error.stack,
    });
  }
})();

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8");
}

const now = () => Date.now();
const rid = (p) => p + "_" + crypto.randomBytes(6).toString("hex");
const makeToken = () => "t_" + crypto.randomBytes(10).toString("base64url");

// ================== SUPABASE HELPERS (with JSON fallback) ==================
// Clinic validation helper - checks Supabase first, then falls back to JSON
async function validateClinicCode(code) {
  const codeUpper = String(code).trim().toUpperCase();
  
  // Try Supabase first
  const isSupabaseAvailable = supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable();
  console.log(`[VALIDATE] Checking clinic "${codeUpper}" - Supabase available: ${isSupabaseAvailable}`);
  
  if (isSupabaseAvailable) {
    console.log(`[VALIDATE] Checking Supabase for clinic "${codeUpper}"...`);
    const clinic = await supabase.getClinicByCode(codeUpper);
    if (clinic) {
      console.log(`[VALIDATE] ✅ Found clinic "${codeUpper}" in Supabase`);
      return { found: true, clinicCode: codeUpper, clinic };
    } else {
      console.log(`[VALIDATE] Clinic "${codeUpper}" not found in Supabase, checking JSON files...`);
    }
  } else {
    console.log(`[VALIDATE] Supabase not available, checking JSON files for clinic "${codeUpper}"...`);
  }
  
  // Fallback to JSON files
  const clinics = readJson(CLINICS_FILE, {});
  if (clinics[codeUpper]) {
    console.log(`[VALIDATE] ✅ Found clinic "${codeUpper}" in clinics.json`);
    return { found: true, clinicCode: codeUpper, clinic: clinics[codeUpper] };
  }
  
  // Check clinic.json for backward compatibility
  const singleClinic = readJson(CLINIC_FILE, {});
  if (singleClinic.clinicCode && String(singleClinic.clinicCode).toUpperCase() === codeUpper) {
    console.log(`[VALIDATE] ✅ Found clinic "${codeUpper}" in clinic.json`);
    return { found: true, clinicCode: codeUpper, clinic: singleClinic };
  }
  
  console.log(`[VALIDATE] ❌ Clinic code "${codeUpper}" not found`);
  return { found: false, clinicCode: null, clinic: null };
}

// Get all clinics - Supabase first, then JSON fallback
async function getAllClinicsData() {
  // Try Supabase first
  const isSupabaseAvailable = supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable();
  console.log(`[GET_CLINICS] Getting all clinics - Supabase available: ${isSupabaseAvailable}`);
  
  if (isSupabaseAvailable) {
    console.log(`[GET_CLINICS] Checking Supabase for clinics...`);
    const clinics = await supabase.getAllClinics();
    const clinicKeys = Object.keys(clinics);
    console.log(`[GET_CLINICS] Supabase returned ${clinicKeys.length} clinic(s):`, clinicKeys);
    
    if (clinicKeys.length > 0) {
      console.log(`[GET_CLINICS] ✅ Returning ${clinicKeys.length} clinic(s) from Supabase:`, clinicKeys);
      return clinics;
    } else {
      console.log(`[GET_CLINICS] ⚠️  No clinics found in Supabase (empty result), falling back to JSON files...`);
    }
  } else {
    console.log(`[GET_CLINICS] ⚠️  Supabase not available, using JSON files...`);
  }
  
  // Fallback to JSON
  const clinics = readJson(CLINICS_FILE, {});
  const jsonKeys = Object.keys(clinics);
  console.log(`[GET_CLINICS] ⚠️  Returning ${jsonKeys.length} clinic(s) from clinics.json (fallback):`, jsonKeys);
  return clinics;
}

// ================== HEALTH ==================
app.get("/health", (req, res) => {
  res.setHeader("X-CLINIFLOW-SERVER", "INDEX_CJS_ADMIN_V3");
  res.json({ ok: true, server: "index.cjs", time: now() });
});

// ================== DEBUG: Check clinics.json and Supabase ==================
app.get("/api/debug/clinics", async (req, res) => {
  const clinics = readJson(CLINICS_FILE, {});
  const clinic = readJson(CLINIC_FILE, {});
  console.log(`[DEBUG] CLINICS_FILE path: ${CLINICS_FILE}`);
  console.log(`[DEBUG] CLINICS_FILE exists: ${fs.existsSync(CLINICS_FILE)}`);
  console.log(`[DEBUG] clinics.json keys:`, Object.keys(clinics));
  console.log(`[DEBUG] clinics.json content:`, JSON.stringify(clinics, null, 2));
  console.log(`[DEBUG] clinic.json content:`, JSON.stringify(clinic, null, 2));
  
  // Check Supabase if available
  let supabaseClinics = {};
  let supabaseAvailable = false;
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    supabaseAvailable = true;
    console.log(`[DEBUG] Checking Supabase for clinics...`);
    supabaseClinics = await getAllClinicsData();
    console.log(`[DEBUG] Supabase clinics:`, Object.keys(supabaseClinics));
  }
  
  res.json({
    ok: true,
    clinicsFileExists: fs.existsSync(CLINICS_FILE),
    clinicsFilePath: CLINICS_FILE,
    clinicsFileKeys: Object.keys(clinics),
    clinicsFileContent: clinics,
    supabaseAvailable: supabaseAvailable,
    supabaseClinicKeys: Object.keys(supabaseClinics),
    supabaseClinics: supabaseClinics,
    clinicFileExists: fs.existsSync(CLINIC_FILE),
    clinicFilePath: CLINIC_FILE,
    clinicFileClinicCode: clinic.clinicCode || null,
    missingInSupabase: Object.keys(clinics).filter(key => !supabaseClinics[key]),
  });
});

// POST /api/debug/migrate-clinics
// Migrate clinics from JSON files to Supabase (admin only - requires authentication)
app.post("/api/debug/migrate-clinics", async (req, res) => {
  try {
    // Check if Supabase is available
    if (!supabase || !supabase.isSupabaseAvailable || !supabase.isSupabaseAvailable()) {
      return res.status(400).json({ ok: false, error: "supabase_not_available" });
    }

    const clinics = readJson(CLINICS_FILE, {});
    const clinic = readJson(CLINIC_FILE, {});
    
    // Get all clinics from Supabase
    const supabaseClinics = await getAllClinicsData();
    
    const migrated = [];
    const skipped = [];
    const errors = [];
    
    // Migrate clinics.json
    for (const [code, clinicData] of Object.entries(clinics)) {
      if (supabaseClinics[code]) {
        skipped.push({ code, reason: "already_exists_in_supabase" });
        continue;
      }
      
      try {
        const supabaseClinicData = {
          clinic_code: code,
          name: clinicData.name || "",
          email: clinicData.email || "",
          password: clinicData.password || "",
          address: clinicData.address || "",
          phone: clinicData.phone || "",
          website: clinicData.website || "",
          logo_url: clinicData.logoUrl || "",
          google_maps_url: clinicData.googleMapsUrl || "",
          default_inviter_discount_percent: clinicData.defaultInviterDiscountPercent,
          default_invited_discount_percent: clinicData.defaultInvitedDiscountPercent,
          created_at: clinicData.createdAt || now(),
          updated_at: clinicData.updatedAt || clinicData.createdAt || now(),
        };
        
        const result = await supabase.createClinic(supabaseClinicData);
        if (result) {
          migrated.push({ code, name: clinicData.name });
          console.log(`[MIGRATE] ✅ Migrated clinic "${code}" to Supabase`);
        } else {
          errors.push({ code, reason: "supabase_create_failed" });
        }
      } catch (error) {
        errors.push({ code, reason: error.message });
        console.error(`[MIGRATE] ❌ Failed to migrate clinic "${code}":`, error);
      }
    }
    
    // Also check clinic.json (backward compatibility)
    if (clinic.clinicCode && !supabaseClinics[clinic.clinicCode]) {
      try {
        const supabaseClinicData = {
          clinic_code: clinic.clinicCode,
          name: clinic.name || "",
          email: clinic.email || "",
          password: clinic.password || "",
          address: clinic.address || "",
          phone: clinic.phone || "",
          website: clinic.website || "",
          logo_url: clinic.logoUrl || "",
          google_maps_url: clinic.googleMapsUrl || "",
          default_inviter_discount_percent: clinic.defaultInviterDiscountPercent,
          default_invited_discount_percent: clinic.defaultInvitedDiscountPercent,
          created_at: clinic.createdAt || now(),
          updated_at: clinic.updatedAt || clinic.createdAt || now(),
        };
        
        const result = await supabase.createClinic(supabaseClinicData);
        if (result) {
          migrated.push({ code: clinic.clinicCode, name: clinic.name });
          console.log(`[MIGRATE] ✅ Migrated clinic "${clinic.clinicCode}" from clinic.json to Supabase`);
        }
      } catch (error) {
        errors.push({ code: clinic.clinicCode, reason: error.message });
      }
    }
    
    res.json({
      ok: true,
      message: `Migration completed. Migrated: ${migrated.length}, Skipped: ${skipped.length}, Errors: ${errors.length}`,
      migrated,
      skipped,
      errors,
    });
  } catch (error) {
    console.error("[MIGRATE] Migration error:", error);
    res.status(500).json({ ok: false, error: error?.message || "migration_failed" });
  }
});

// Update existing Supabase clinics with data from JSON files (fill empty fields)
app.post("/api/debug/update-supabase-clinics", async (req, res) => {
  try {
    // Check if Supabase is available
    if (!supabase || !supabase.isSupabaseAvailable || !supabase.isSupabaseAvailable()) {
      return res.status(400).json({ ok: false, error: "supabase_not_available" });
    }

    const clinics = readJson(CLINICS_FILE, {});
    const clinic = readJson(CLINIC_FILE, {});
    
    // Get all clinics from Supabase
    const supabaseClinics = await getAllClinicsData();
    
    const updated = [];
    const skipped = [];
    const errors = [];
    
    // Update clinics from clinics.json
    for (const [code, clinicData] of Object.entries(clinics)) {
      const supabaseClinic = supabaseClinics[code];
      if (!supabaseClinic) {
        skipped.push({ code, reason: "not_found_in_supabase" });
        continue;
      }
      
      try {
        // Only update fields that are empty in Supabase but have values in JSON
        const updates = {};
        if ((!supabaseClinic.address || !supabaseClinic.address.trim()) && clinicData.address && clinicData.address.trim()) {
          updates.address = clinicData.address;
        }
        if ((!supabaseClinic.phone || !supabaseClinic.phone.trim()) && clinicData.phone && clinicData.phone.trim()) {
          updates.phone = clinicData.phone;
        }
        if ((!supabaseClinic.website || !supabaseClinic.website.trim()) && clinicData.website && clinicData.website.trim()) {
          updates.website = clinicData.website;
        }
        if ((!supabaseClinic.logo_url || !supabaseClinic.logo_url.trim()) && clinicData.logoUrl && clinicData.logoUrl.trim()) {
          updates.logo_url = clinicData.logoUrl;
        }
        if ((!supabaseClinic.google_maps_url || !supabaseClinic.google_maps_url.trim()) && clinicData.googleMapsUrl && clinicData.googleMapsUrl.trim()) {
          updates.google_maps_url = clinicData.googleMapsUrl;
        }
        if (supabaseClinic.name === "" || !supabaseClinic.name || supabaseClinic.name.trim() === "") {
          updates.name = clinicData.name || "";
        }
        if (supabaseClinic.email === "" || !supabaseClinic.email || supabaseClinic.email.trim() === "") {
          updates.email = clinicData.email || "";
        }
        
        if (Object.keys(updates).length > 0) {
          updates.updated_at = now();
          const result = await supabase.updateClinic(code, updates);
          if (result) {
            updated.push({ code, name: clinicData.name, fields: Object.keys(updates) });
            console.log(`[UPDATE-SUPABASE] ✅ Updated clinic "${code}" in Supabase:`, Object.keys(updates));
          } else {
            errors.push({ code, reason: "supabase_update_failed" });
          }
        } else {
          skipped.push({ code, reason: "no_empty_fields_to_update" });
        }
      } catch (error) {
        errors.push({ code, reason: error.message });
        console.error(`[UPDATE-SUPABASE] ❌ Failed to update clinic "${code}":`, error);
      }
    }
    
    // Also check clinic.json (backward compatibility)
    if (clinic.clinicCode) {
      const supabaseClinic = supabaseClinics[clinic.clinicCode];
      if (supabaseClinic) {
        try {
          const updates = {};
          if ((!supabaseClinic.address || !supabaseClinic.address.trim()) && clinic.address && clinic.address.trim()) {
            updates.address = clinic.address;
          }
          if ((!supabaseClinic.phone || !supabaseClinic.phone.trim()) && clinic.phone && clinic.phone.trim()) {
            updates.phone = clinic.phone;
          }
          if ((!supabaseClinic.website || !supabaseClinic.website.trim()) && clinic.website && clinic.website.trim()) {
            updates.website = clinic.website;
          }
          if ((!supabaseClinic.logo_url || !supabaseClinic.logo_url.trim()) && clinic.logoUrl && clinic.logoUrl.trim()) {
            updates.logo_url = clinic.logoUrl;
          }
          if ((!supabaseClinic.google_maps_url || !supabaseClinic.google_maps_url.trim()) && clinic.googleMapsUrl && clinic.googleMapsUrl.trim()) {
            updates.google_maps_url = clinic.googleMapsUrl;
          }
          if (supabaseClinic.name === "" || !supabaseClinic.name || supabaseClinic.name.trim() === "") {
            updates.name = clinic.name || "";
          }
          if (supabaseClinic.email === "" || !supabaseClinic.email || supabaseClinic.email.trim() === "") {
            updates.email = clinic.email || "";
          }
          
          if (Object.keys(updates).length > 0) {
            updates.updated_at = now();
            const result = await supabase.updateClinic(clinic.clinicCode, updates);
            if (result) {
              updated.push({ code: clinic.clinicCode, name: clinic.name, fields: Object.keys(updates) });
              console.log(`[UPDATE-SUPABASE] ✅ Updated clinic "${clinic.clinicCode}" from clinic.json in Supabase:`, Object.keys(updates));
            }
          }
        } catch (error) {
          errors.push({ code: clinic.clinicCode, reason: error.message });
        }
      }
    }
    
    res.json({ ok: true, updated, skipped, errors });
  } catch (error) {
    console.error("[UPDATE-SUPABASE] Error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ================== REGISTER ==================
app.post("/api/register", async (req, res) => {
  const { name = "", phone = "", referralCode = "", clinicCode = "" } = req.body || {};
  if (!String(phone).trim()) {
    return res.status(400).json({ ok: false, error: "phone_required" });
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    console.log(`[REGISTER] Validating clinic code: "${code}"`);
    
    const validation = await validateClinicCode(code);
    if (!validation.found) {
      const allClinics = await getAllClinicsData();
      console.log(`[REGISTER] ❌ Clinic code "${code}" not found. Available clinics:`, Object.keys(allClinics));
      return res.status(400).json({ ok: false, error: "invalid_clinic_code", code, available: Object.keys(allClinics) });
    }
    validatedClinicCode = validation.clinicCode;
  }

  const patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // patients - Save to Supabase first (if available)
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    const patientData = {
      patient_id: patientId,
      request_id: requestId,
      clinic_code: validatedClinicCode,
      name: String(name || ""),
      phone: String(phone || ""),
      email: "",
      status: "PENDING",
      referral_code: referralCode || "",
      created_at: now(),
      updated_at: now(),
    };
    const supabasePatient = await supabase.createPatient(patientData);
    if (supabasePatient) {
      console.log(`[REGISTER] ✅ Created patient in Supabase for patientId: ${patientId}`);
    } else {
      console.warn(`[REGISTER] ⚠️  Failed to create patient in Supabase, falling back to JSON`);
    }
  }
  
  // Fallback to JSON file
  const patients = readJson(PAT_FILE, {});
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    phone: String(phone || ""),
    status: "PENDING",
    clinicCode: validatedClinicCode,
    createdAt: now(),
    updatedAt: now(),
  };
  writeJson(PAT_FILE, patients);

  // tokens - Save to Supabase first (if available)
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    const tokenData = {
      token: token,
      patient_id: patientId,
      clinic_code: validatedClinicCode,
      expires_at: now() + (365 * 24 * 60 * 60 * 1000), // 1 year from now
      created_at: now(),
    };
    const supabaseToken = await supabase.createPatientToken(tokenData);
    if (supabaseToken) {
      console.log(`[REGISTER] ✅ Created patient token in Supabase for patientId: ${patientId}`);
    } else {
      console.warn(`[REGISTER] ⚠️  Failed to create patient token in Supabase, falling back to JSON`);
    }
  }
  
  // Fallback to JSON file
  const tokens = readJson(TOK_FILE, {});
  tokens[token] = { patientId, role: "PENDING", createdAt: now() };
  writeJson(TOK_FILE, tokens);

  // registrations (array/object safe)
  const regs = readJson(REG_FILE, {});
  const row = {
    requestId,
    patientId,
    name: String(name || ""),
    phone: String(phone || ""),
    clinicCode: validatedClinicCode, // Add clinicCode to registration
    status: "PENDING",
    createdAt: now(),
    updatedAt: now(),
  };
  if (Array.isArray(regs)) {
    regs.push(row);
    writeJson(REG_FILE, regs);
  } else {
    regs[requestId] = row;
    writeJson(REG_FILE, regs);
  }

  // Handle referral code if provided
  if (referralCode && String(referralCode).trim()) {
    try {
      const refCode = String(referralCode).trim();
      // Find inviter by referral code (check patients for matching referralCode)
      // For now, we'll use a simple approach: store referral codes in patient records
      // and match by code
      const allPatients = readJson(PAT_FILE, {});
      let inviterPatientId = null;
      let inviterPatientName = null;
      
      // Search for patient with matching referral code
      for (const pid in allPatients) {
        const p = allPatients[pid];
        // For now, we'll match by patientId if referralCode matches patientId pattern
        // Or check if patient has referralCode field
        if (p.referralCode === refCode || pid === refCode) {
          inviterPatientId = pid;
          inviterPatientName = p.name || "Unknown";
          break;
        }
      }
      
      // If no match found by referralCode field, try matching by patientId
      // (for backward compatibility, patientId can be used as referral code)
      if (!inviterPatientId && allPatients[refCode]) {
        inviterPatientId = refCode;
        inviterPatientName = allPatients[refCode].name || "Unknown";
      }
      
      // Create referral record if inviter found
      if (inviterPatientId) {
        const referrals = readJson(REF_FILE, []);
        const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
        
        const newReferral = {
          id: rid("ref"),
          inviterPatientId,
          inviterPatientName,
          invitedPatientId: patientId,
          invitedPatientName: String(name || ""),
          status: "PENDING",
          createdAt: now(),
          inviterDiscountPercent: null,
          invitedDiscountPercent: null,
          discountPercent: null,
          checkInAt: null,
          approvedAt: null,
        };
        
        referralList.push(newReferral);
        writeJson(REF_FILE, referralList);
        console.log(`[REGISTER] Created referral: ${newReferral.id} (inviter: ${inviterPatientId}, invited: ${patientId})`);
      } else {
        console.log(`[REGISTER] Referral code not found: ${refCode}`);
      }
    } catch (err) {
      console.error("[REGISTER] Referral creation error:", err);
      // Don't fail registration if referral creation fails
    }
  }

  res.json({ ok: true, token, patientId, requestId, role: "PENDING", status: "PENDING" });
});

// GET /api/debug/test-clinic/:code
// Test if a clinic code exists in Supabase
app.get("/api/debug/test-clinic/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").trim().toUpperCase();
    console.log(`[TEST] Testing clinic code: "${code}"`);
    
    // Check Supabase
    let supabaseResult = null;
    if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
      console.log(`[TEST] Checking Supabase for clinic "${code}"...`);
      supabaseResult = await supabase.getClinicByCode(code);
    }
    
    // Check JSON
    const clinics = readJson(CLINICS_FILE, {});
    const jsonResult = clinics[code] || null;
    
    // Test validateClinicCode
    const validation = await validateClinicCode(code);
    
    res.json({
      ok: true,
      code,
      supabaseFound: !!supabaseResult,
      supabaseData: supabaseResult ? { id: supabaseResult.id, name: supabaseResult.name, clinic_code: supabaseResult.clinic_code } : null,
      jsonFound: !!jsonResult,
      jsonData: jsonResult ? { clinicCode: jsonResult.clinicCode, name: jsonResult.name } : null,
      validateResult: validation,
    });
  } catch (error) {
    console.error("[TEST] Error:", error);
    res.status(500).json({ ok: false, error: error?.message || "test_failed" });
  }
});

// ================== PATIENT REGISTER (alias) ==================
app.post("/api/patient/register", async (req, res) => {
  const { name = "", phone = "", referralCode = "", clinicCode = "" } = req.body || {};
  if (!String(phone).trim()) {
    return res.status(400).json({ ok: false, error: "phone_required" });
  }

  // Validate clinic code if provided
  let validatedClinicCode = null;
  if (clinicCode && String(clinicCode).trim()) {
    const code = String(clinicCode).trim().toUpperCase();
    console.log(`[REGISTER /api/patient/register] Validating clinic code: "${code}"`);
    
    const validation = await validateClinicCode(code);
    if (!validation.found) {
      const allClinics = await getAllClinicsData();
      console.log(`[REGISTER /api/patient/register] ❌ Clinic code "${code}" not found. Available clinics:`, Object.keys(allClinics));
      return res.status(400).json({ ok: false, error: "invalid_clinic_code", code, available: Object.keys(allClinics) });
    }
    validatedClinicCode = validation.clinicCode;
  }

  const patientId = rid("p");
  const requestId = rid("req");
  const token = makeToken();

  // patients - Save to Supabase first (if available)
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    const patientData = {
      patient_id: patientId,
      request_id: requestId,
      clinic_code: validatedClinicCode,
      name: String(name || ""),
      phone: String(phone || ""),
      email: "",
      status: "PENDING",
      referral_code: referralCode || "",
      created_at: now(),
      updated_at: now(),
    };
    const supabasePatient = await supabase.createPatient(patientData);
    if (supabasePatient) {
      console.log(`[REGISTER] ✅ Created patient in Supabase for patientId: ${patientId}`);
    } else {
      console.warn(`[REGISTER] ⚠️  Failed to create patient in Supabase, falling back to JSON`);
    }
  }
  
  // Fallback to JSON file
  const patients = readJson(PAT_FILE, {});
  patients[patientId] = {
    patientId,
    name: String(name || ""),
    phone: String(phone || ""),
    status: "PENDING",
    clinicCode: validatedClinicCode,
    createdAt: now(),
    updatedAt: now(),
  };
  writeJson(PAT_FILE, patients);

  // tokens - Save to Supabase first (if available)
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    const tokenData = {
      token: token,
      patient_id: patientId,
      clinic_code: validatedClinicCode,
      expires_at: now() + (365 * 24 * 60 * 60 * 1000), // 1 year from now
      created_at: now(),
    };
    const supabaseToken = await supabase.createPatientToken(tokenData);
    if (supabaseToken) {
      console.log(`[REGISTER] ✅ Created patient token in Supabase for patientId: ${patientId}`);
    } else {
      console.warn(`[REGISTER] ⚠️  Failed to create patient token in Supabase, falling back to JSON`);
    }
  }
  
  // Fallback to JSON file
  const tokens = readJson(TOK_FILE, {});
  tokens[token] = { patientId, role: "PENDING", createdAt: now() };
  writeJson(TOK_FILE, tokens);

  // registrations (array/object safe)
  const regs = readJson(REG_FILE, {});
  const row = {
    requestId,
    patientId,
    name: String(name || ""),
    phone: String(phone || ""),
    clinicCode: validatedClinicCode, // Add clinicCode to registration
    status: "PENDING",
    createdAt: now(),
    updatedAt: now(),
  };
  if (Array.isArray(regs)) {
    regs.push(row);
    writeJson(REG_FILE, regs);
  } else {
    regs[requestId] = row;
    writeJson(REG_FILE, regs);
  }

  // Handle referral code if provided (same logic as /api/register)
  if (referralCode && String(referralCode).trim()) {
    try {
      const refCode = String(referralCode).trim();
      const allPatients = readJson(PAT_FILE, {});
      let inviterPatientId = null;
      let inviterPatientName = null;
      
      for (const pid in allPatients) {
        const p = allPatients[pid];
        if (p.referralCode === refCode || pid === refCode) {
          inviterPatientId = pid;
          inviterPatientName = p.name || "Unknown";
          break;
        }
      }
      
      if (!inviterPatientId && allPatients[refCode]) {
        inviterPatientId = refCode;
        inviterPatientName = allPatients[refCode].name || "Unknown";
      }
      
      if (inviterPatientId) {
        const referrals = readJson(REF_FILE, []);
        const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
        
        const newReferral = {
          id: rid("ref"),
          inviterPatientId,
          inviterPatientName,
          invitedPatientId: patientId,
          invitedPatientName: String(name || ""),
          status: "PENDING",
          createdAt: now(),
          inviterDiscountPercent: null,
          invitedDiscountPercent: null,
          discountPercent: null,
          checkInAt: null,
          approvedAt: null,
        };
        
        referralList.push(newReferral);
        writeJson(REF_FILE, referralList);
        console.log(`[PATIENT/REGISTER] Created referral: ${newReferral.id} (inviter: ${inviterPatientId}, invited: ${patientId})`);
      }
    } catch (err) {
      console.error("[PATIENT/REGISTER] Referral creation error:", err);
    }
  }

  res.json({ ok: true, token, patientId, requestId, role: "PENDING", status: "PENDING" });
});

// ================== AUTH ==================
function requireToken(req, res, next) {
  (async () => {
    try {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      // Also check x-patient-token header (for compatibility)
      const altToken = req.headers["x-patient-token"] || "";
      const finalToken = token || altToken;
      
      if (!finalToken) {
        console.log("[AUTH] Missing token");
        return res.status(401).json({ ok: false, error: "missing_token" });
      }

      // Try Supabase first (if available)
      if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
        try {
          const supabaseToken = await supabase.getPatientToken(finalToken);
          if (supabaseToken) {
            // Check if token is expired
            const now = Date.now();
            if (supabaseToken.expires_at && supabaseToken.expires_at < now) {
              console.log(`[AUTH] Token expired: ${finalToken.substring(0, 10)}...`);
              return res.status(401).json({ ok: false, error: "token_expired" });
            }
            
            // Get patient to determine role
            const patient = await supabase.getPatientById(supabaseToken.patient_id);
            const role = patient?.status === "APPROVED" ? "APPROVED" : "PENDING";
            
            req.patientId = supabaseToken.patient_id;
            req.role = role;
            console.log(`[AUTH] ✅ Token verified from Supabase: patientId=${supabaseToken.patient_id}, role=${role}`);
            return next();
          }
        } catch (supabaseError) {
          console.error(`[AUTH] Supabase token lookup error:`, supabaseError?.message);
          // Fall through to JSON fallback
        }
      }
      
      // Fallback to JSON file
      const tokens = readJson(TOK_FILE, {});
      const t = tokens[finalToken];
      if (!t?.patientId) {
        console.log(`[AUTH] Bad token: ${finalToken.substring(0, 10)}... (not found in tokens.json or Supabase)`);
        console.log(`[AUTH] Available tokens in JSON: ${Object.keys(tokens).length} tokens`);
        return res.status(401).json({ ok: false, error: "bad_token" });
      }

      req.patientId = t.patientId;
      req.role = t.role || "PENDING";
      console.log(`[AUTH] ✅ Token verified from JSON: patientId=${t.patientId}, role=${req.role}`);
      next();
    } catch (error) {
      console.error("[AUTH] requireToken error:", error);
      return res.status(401).json({ ok: false, error: "auth_error" });
    }
  })();
}

// ================== ME ==================
app.get("/api/me", requireToken, (req, res) => {
  const patients = readJson(PAT_FILE, {});
  const p = patients[req.patientId] || null;

  res.json({
    ok: true,
    patientId: req.patientId,
    role: req.role,
    status: p?.status || req.role,
    name: p?.name || "",
    phone: p?.phone || "",
    clinicCode: p?.clinicCode || null, // Include clinic code in response
  });
});

// ================== PATIENT ME (alias) ==================
app.get("/api/patient/me", requireToken, (req, res) => {
  const patients = readJson(PAT_FILE, {});
  const p = patients[req.patientId] || null;

  // Priority: patient.status > token.role > "PENDING"
  const finalStatus = p?.status || req.role || "PENDING";
  
  const clinicCode = p?.clinicCode || null;
  console.log(`[ME] patientId: ${req.patientId}, patient.status: ${p?.status}, token.role: ${req.role}, finalStatus: ${finalStatus}, clinicCode: ${clinicCode}`);
  console.log(`[ME] Patient record:`, JSON.stringify(p, null, 2));

  res.json({
    ok: true,
    patientId: req.patientId,
    role: finalStatus, // Return the final status as role too
    status: finalStatus, // Return the final status
    name: p?.name || "",
    phone: p?.phone || "",
    clinicCode: clinicCode, // Include clinic code in response
  });
});

// ================== ADMIN LIST ==================
app.get("/api/admin/registrations", (req, res) => {
  const raw = readJson(REG_FILE, {});
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ ok: true, list });
});

// ================== ADMIN MIDDLEWARE ==================
// Middleware to verify admin JWT token and extract clinic code
function requireAdmin(req, res, next) {
  console.log(`[REQUIRE_ADMIN] ========== START ==========`);
  console.log(`[REQUIRE_ADMIN] Method: ${req.method}`);
  console.log(`[REQUIRE_ADMIN] Path: ${req.path || req.url}`);
  console.log(`[REQUIRE_ADMIN] Authorization header:`, req.headers.authorization ? "present" : "missing");
  console.log(`[REQUIRE_ADMIN] X-Admin-Token header:`, req.headers["x-admin-token"] ? "present" : "missing");
  try {
    const authHeader = req.headers.authorization || req.headers["x-admin-token"];
    if (!authHeader) {
      console.log(`[REQUIRE_ADMIN] ❌ Missing token, returning 401`);
      return res.status(401).json({ ok: false, error: "missing_token" });
    }
    
    // Extract token from "Bearer <token>" or just "<token>"
    const token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
    
    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }
    
    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error(`[REQUIRE_ADMIN] ❌ JWT verification failed:`, jwtError?.message);
      console.error(`[REQUIRE_ADMIN] ========== END (JWT_ERROR) ==========`);
      return res.status(401).json({ ok: false, error: "bad_token" });
    }
    
    // Extract clinic code from token
    if (!decoded.clinicCode) {
      console.error(`[REQUIRE_ADMIN] ❌ Invalid token format: no clinicCode in decoded token`);
      console.error(`[REQUIRE_ADMIN] ========== END (INVALID_TOKEN) ==========`);
      return res.status(401).json({ ok: false, error: "invalid_token_format" });
    }
    
    // Attach clinic code to request
    req.clinicCode = String(decoded.clinicCode).toUpperCase();
    req.adminToken = token;
    
    next();
  } catch (error) {
    console.error(`[REQUIRE_ADMIN] ❌ Admin middleware error:`, error);
    console.error(`[REQUIRE_ADMIN] ========== END (EXCEPTION) ==========`);
    return res.status(401).json({ ok: false, error: "auth_error" });
  }
}

// GET /api/admin/patients - Returns all patients (from both registrations.json and patients.json)
// Filtered by clinic code from JWT token
app.get("/api/admin/patients", requireAdmin, (req, res) => {
  const clinicCode = req.clinicCode;
  console.log(`[GET /api/admin/patients] ========== START ==========`);
  console.log(`[GET /api/admin/patients] Clinic code from token: ${clinicCode}`);
  
  // Read registrations.json
  const regsRaw = readJson(REG_FILE, {});
  const regsList = Array.isArray(regsRaw) ? regsRaw : Object.values(regsRaw);
  console.log(`[GET /api/admin/patients] Registrations count: ${regsList.length}`);
  
  // Read patients.json
  const patientsRaw = readJson(PAT_FILE, {});
  const patientsList = Array.isArray(patientsRaw) ? Object.values(patientsRaw) : Object.values(patientsRaw);
  console.log(`[GET /api/admin/patients] Patients count: ${patientsList.length}`);
  
  // Create a map to merge by patientId
  const patientMap = new Map();
  
  // Add all registrations first (filtered by clinic code)
  for (const reg of regsList) {
    const regClinicCode = reg.clinicCode ? String(reg.clinicCode).toUpperCase() : "";
    // Only include patients from this clinic
    // IMPORTANT: If regClinicCode is empty, skip it (old patients without clinicCode should not appear)
    if (!regClinicCode || regClinicCode !== clinicCode) {
      console.log(`[GET /api/admin/patients] Skipping registration: patientId=${reg.patientId}, regClinicCode="${regClinicCode}", expected="${clinicCode}"`);
      continue;
    }
    
    const id = reg.patientId || reg.requestId;
    if (id) {
      patientMap.set(id, {
        patientId: reg.patientId || reg.requestId,
        requestId: reg.requestId,
        name: reg.name || "",
        phone: reg.phone || "",
        status: reg.status || "PENDING",
        createdAt: reg.createdAt || 0,
        updatedAt: reg.updatedAt || reg.createdAt || 0,
        clinicCode: reg.clinicCode || "",
      });
    }
  }
  
  // Add/update with patients.json data (more recent/complete, filtered by clinic code)
  for (const patient of patientsList) {
    const patientClinicCode = patient.clinicCode ? String(patient.clinicCode).toUpperCase() : "";
    // Only include patients from this clinic
    // IMPORTANT: If patientClinicCode is empty, skip it (old patients without clinicCode should not appear)
    if (!patientClinicCode || patientClinicCode !== clinicCode) {
      console.log(`[GET /api/admin/patients] Skipping patient: patientId=${patient.patientId}, patientClinicCode="${patientClinicCode}", expected="${clinicCode}"`);
      continue;
    }
    
    const id = patient.patientId;
    if (id) {
      const existing = patientMap.get(id);
      patientMap.set(id, {
        patientId: patient.patientId,
        requestId: existing?.requestId || patient.patientId,
        name: patient.name || existing?.name || "",
        phone: patient.phone || existing?.phone || "",
        status: patient.status || existing?.status || "APPROVED",
        createdAt: patient.createdAt || existing?.createdAt || 0,
        updatedAt: patient.updatedAt || patient.createdAt || existing?.updatedAt || 0,
        clinicCode: patient.clinicCode || existing?.clinicCode || "",
      });
    }
  }
  
  // Convert to array and sort by updatedAt (newest first)
  const combinedList = Array.from(patientMap.values()).sort(
    (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
  );
  
  console.log(`[GET /api/admin/patients] Filtered list count for clinic ${clinicCode}: ${combinedList.length}`);
  console.log(`[GET /api/admin/patients] ========== END ==========`);
  
  res.json({ ok: true, list: combinedList });
});

// ================== ADMIN APPROVE ==================
app.post("/api/admin/approve", requireAdmin, (req, res) => {
  const clinicCode = req.clinicCode;
  const { requestId, patientId } = req.body || {};
  
  console.log(`[APPROVE] ========== START APPROVE ==========`);
  console.log(`[APPROVE] Clinic code from token: ${clinicCode}`);
  console.log(`[APPROVE] Request body:`, JSON.stringify({ requestId, patientId }, null, 2));
  
  // PRIORITY: Use patientId first if available (more reliable), then requestId
  if (!requestId && !patientId) {
    return res.status(400).json({ ok: false, error: "requestId_or_patientId_required" });
  }

  console.log(`[APPROVE] Will search with patientId: ${patientId}, requestId: ${requestId}`);

  const regsRaw = readJson(REG_FILE, {});
  let r = null;

  console.log(`[APPROVE] registrations.json type: ${Array.isArray(regsRaw) ? 'array' : typeof regsRaw}`);
  if (Array.isArray(regsRaw)) {
    console.log(`[APPROVE] registrations.json array length: ${regsRaw.length}`);
  } else if (regsRaw && typeof regsRaw === "object") {
    console.log(`[APPROVE] registrations.json object keys count: ${Object.keys(regsRaw).length}`);
    console.log(`[APPROVE] First 5 keys:`, Object.keys(regsRaw).slice(0, 5));
  }

  // PRIORITY: Search by patientId first (more reliable), then by requestId
  // First, try to find in registrations.json
  if (Array.isArray(regsRaw)) {
    console.log(`[APPROVE] registrations.json is an array with ${regsRaw.length} items`);
    
    // PRIORITY 1: Search by patientId (most reliable)
    if (patientId) {
      r = regsRaw.find((x) => x && (x.patientId === patientId || x.requestId === patientId)) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in array by patientId:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in array by patientId: ${patientId}`);
      }
    }
    
    // PRIORITY 2: Search by requestId (if different from patientId)
    if (!r && requestId && requestId !== patientId) {
      r = regsRaw.find((x) => x && x.requestId === requestId) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in array by requestId:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in array by requestId: ${requestId}`);
      }
    }
    
  } else if (regsRaw && typeof regsRaw === "object") {
    console.log(`[APPROVE] registrations.json is an object with ${Object.keys(regsRaw).length} keys`);
    
    // PRIORITY 1: Search by patientId in values (also check requestId field)
    if (patientId) {
      r = Object.values(regsRaw).find((x) => x && (x.patientId === patientId || x.requestId === patientId)) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in object by patientId:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in object by patientId: ${patientId}`);
      }
    }
    
    // PRIORITY 2: Try requestId as key (if different from patientId)
    if (!r && requestId && requestId !== patientId) {
    r = regsRaw[requestId] || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in object by requestId key:`, { requestId: r.requestId, patientId: r.patientId });
      }
    }
    
    // PRIORITY 3: Search all values by requestId (if different from patientId)
    if (!r && requestId && requestId !== patientId) {
      r = Object.values(regsRaw).find((x) => x && x.requestId === requestId) || null;
      if (r) {
        console.log(`[APPROVE] ✅ Found in object by requestId value:`, { requestId: r.requestId, patientId: r.patientId });
      } else {
        console.log(`[APPROVE] ❌ Not found in object by requestId: ${requestId}`);
      }
    }
  } else {
    console.log(`[APPROVE] registrations.json is empty or invalid`);
  }

  // If not found in registrations, try patients.json
  // PRIORITY: If we have patientId, use it directly (most reliable)
  if (!r?.patientId) {
    console.log(`[APPROVE] Registration not found, checking patients.json`);
    const patients = readJson(PAT_FILE, {});
    console.log(`[APPROVE] Total patients in patients.json: ${Object.keys(patients).length}`);
    console.log(`[APPROVE] Available patient IDs (first 10):`, Object.keys(patients).slice(0, 10));
    
    let patient = null;
    
    // PRIORITY 1: If we have patientId from request, use it directly (most reliable)
    if (patientId) {
      // Try direct key lookup first
      patient = patients[patientId] || null;
      if (patient) {
        console.log(`[APPROVE] ✅ Found patient directly by patientId key: ${patientId}`);
      } else {
        // Try searching by patientId field in all patients
        console.log(`[APPROVE] Direct lookup failed, searching by patientId field...`);
        for (const pid in patients) {
          const p = patients[pid];
          if (p && (pid === patientId || p.patientId === patientId)) {
            patient = p;
            console.log(`[APPROVE] ✅ Found patient by searching: ${pid} (patientId field: ${p.patientId})`);
            break;
          }
        }
        if (!patient) {
          console.log(`[APPROVE] ❌ Patient not found by patientId: ${patientId}`);
        }
      }
    }
    
    // PRIORITY 2: Search all patients by patientId field (if patientId not found by direct lookup)
    if (!patient && patientId) {
      for (const pid in patients) {
        const p = patients[pid];
        if (p && (pid === patientId || p.patientId === patientId)) {
          patient = p;
          console.log(`[APPROVE] ✅ Found patient by searching with patientId: ${pid} (patientId: ${p.patientId})`);
          break;
        }
      }
    }
    
    // PRIORITY 3: Try requestId as search key (last resort)
    if (!patient && requestId) {
      patient = patients[requestId] || null;
      if (patient) {
        console.log(`[APPROVE] ✅ Found patient by requestId as key: ${requestId}`);
      }
    }
    
    // PRIORITY 4: Last resort - Search all registrations to find patientId from requestId (any format)
    if (!patient && requestId) {
      console.log(`[APPROVE] Last resort: Searching all registrations for requestId: ${requestId}`);
      const allRegs = readJson(REG_FILE, {});
      const regList = Array.isArray(allRegs) ? allRegs : Object.values(allRegs);
      const foundReg = regList.find((reg) => reg && reg.requestId === requestId);
      if (foundReg && foundReg.patientId) {
        patient = patients[foundReg.patientId] || null;
        if (patient) {
          console.log(`[APPROVE] ✅ Found patient via registration lookup: ${foundReg.patientId}`);
          // Use the found registration
          r = foundReg;
        } else {
          console.log(`[APPROVE] ❌ Found registration but patient not found: ${foundReg.patientId}`);
        }
      } else {
        console.log(`[APPROVE] ❌ Registration not found with requestId: ${requestId}`);
      }
    }
    
    if (patient) {
      // Verify patient belongs to this clinic
      const patientClinicCode = patient.clinicCode ? String(patient.clinicCode).toUpperCase() : "";
      if (patientClinicCode && patientClinicCode !== clinicCode) {
        console.log(`[APPROVE] ❌ Patient belongs to clinic ${patientClinicCode}, but admin is from clinic ${clinicCode}`);
        return res.status(403).json({ ok: false, error: "patient_belongs_to_different_clinic" });
      }
      
      console.log(`[APPROVE] Found patient directly in patients.json, creating registration entry`);
      // Create a registration entry for this patient
      const patientIdToUse = patient.patientId || patientId;
      const newReg = {
        requestId: requestId || `req_${patientIdToUse}`,
        patientId: patientIdToUse,
        name: patient.name || "",
        phone: patient.phone || "",
        status: "PENDING",
        clinicCode: patient.clinicCode || clinicCode, // Use patient's clinic code or admin's clinic code
        createdAt: patient.createdAt || now(),
        updatedAt: now(),
      };
      
      // Add to registrations
      const regs = readJson(REG_FILE, {});
      if (Array.isArray(regs)) {
        regs.push(newReg);
        writeJson(REG_FILE, regs);
      } else {
        const regsObj = regs || {};
        regsObj[newReg.requestId] = newReg;
        writeJson(REG_FILE, regsObj);
      }
      
      r = newReg;
      console.log(`[APPROVE] Created registration entry:`, newReg);
    } else {
      const availableIds = Object.keys(patients).slice(0, 10);
      console.log(`[APPROVE] Patient not found in patients.json.`);
      console.log(`[APPROVE] Searched for: requestId=${requestId}, patientId=${patientId}`);
      console.log(`[APPROVE] Available patient IDs (first 10):`, availableIds);
      const errorMessage = `Patient not found. Searched with: ${JSON.stringify({ requestId, patientId })}. Available patient IDs: ${availableIds.join(", ")}`;
      return res.status(404).json({ 
        ok: false, 
        error: "not_found", 
        message: errorMessage 
      });
    }
  }

  // Verify registration belongs to this clinic
  const regClinicCode = r.clinicCode ? String(r.clinicCode).toUpperCase() : "";
  if (regClinicCode && regClinicCode !== clinicCode) {
    console.log(`[APPROVE] ❌ Registration belongs to clinic ${regClinicCode}, but admin is from clinic ${clinicCode}`);
    return res.status(403).json({ ok: false, error: "registration_belongs_to_different_clinic" });
  }

  // patient APPROVED - Update in Supabase first (if available)
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    const patientUpdates = {
      clinic_code: r.clinicCode || clinicCode,
      name: r.name || "",
      phone: r.phone || "",
      status: "APPROVED",
      updated_at: now(),
    };
    console.log(`[APPROVE] Attempting to update patient "${r.patientId}" in Supabase with:`, patientUpdates);
    const supabasePatient = await supabase.updatePatient(r.patientId, patientUpdates);
    if (supabasePatient) {
      console.log(`[APPROVE] ✅ Updated patient "${r.patientId}" in Supabase to APPROVED`);
    } else {
      // If patient doesn't exist in Supabase, create it
      const patientData = {
        patient_id: r.patientId,
        request_id: r.requestId || "",
        clinic_code: r.clinicCode || clinicCode,
        name: r.name || "",
        phone: r.phone || "",
        email: "",
        status: "APPROVED",
        referral_code: r.referralCode || "",
        created_at: r.createdAt || now(),
        updated_at: now(),
      };
      const createdPatient = await supabase.createPatient(patientData);
      if (createdPatient) {
        console.log(`[APPROVE] ✅ Created patient "${r.patientId}" in Supabase with APPROVED status`);
      } else {
        console.warn(`[APPROVE] ⚠️  Failed to create/update patient "${r.patientId}" in Supabase`);
      }
    }
  }
  
  // Fallback to JSON file
  const patients = readJson(PAT_FILE, {});
  patients[r.patientId] = {
    ...(patients[r.patientId] || { patientId: r.patientId, createdAt: now() }),
    name: r.name || patients[r.patientId]?.name || "",
    phone: r.phone || patients[r.patientId]?.phone || "",
    status: "APPROVED",
    clinicCode: r.clinicCode || clinicCode, // Ensure clinic code is set
    updatedAt: now(),
  };
  writeJson(PAT_FILE, patients);

  // tokens for patient -> APPROVED
  // Note: Patient tokens in Supabase don't have a role column, but patient status is in patients table
  // The role is determined by patient status in requireToken, so we don't need to update tokens
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    console.log(`[APPROVE] Patient ${r.patientId} approved - tokens in Supabase will use APPROVED role based on patient status`);
  }
  
  // Fallback to JSON file
  const tokens = readJson(TOK_FILE, {});
  let upgradedTokens = 0;
  for (const tk of Object.keys(tokens)) {
    if (tokens[tk]?.patientId === r.patientId) {
      tokens[tk].role = "APPROVED";
      upgradedTokens++;
      console.log(`[APPROVE] Upgraded token: ${tk.substring(0, 10)}... for patientId: ${r.patientId}`);
    }
  }
  writeJson(TOK_FILE, tokens);
  console.log(`[APPROVE] Total tokens upgraded in JSON: ${upgradedTokens} for patientId: ${r.patientId}`);

  // registrations update
  if (Array.isArray(regsRaw)) {
    regsRaw.forEach((x) => {
      if (x && x.patientId === r.patientId) {
        x.status = "APPROVED";
        x.updatedAt = now();
        x.requestId = x.requestId || requestId;
      }
    });
    writeJson(REG_FILE, regsRaw);
  } else {
    const key = r.requestId || requestId;
    regsRaw[key] = { ...r, status: "APPROVED", updatedAt: now(), requestId: key };
    writeJson(REG_FILE, regsRaw);
  }

  res.json({ ok: true, patientId: r.patientId, status: "APPROVED", upgradedTokens });
});

// ================== PATIENT TRAVEL ==================
// GET /api/patient/:patientId/travel
app.get("/api/patient/:patientId/travel", (req, res) => {
  const patientId = req.params.patientId;
  const TRAVEL_DIR = path.join(DATA_DIR, "travel");
  if (!fs.existsSync(TRAVEL_DIR)) fs.mkdirSync(TRAVEL_DIR, { recursive: true });
  
  const travelFile = path.join(TRAVEL_DIR, `${patientId}.json`);
  const defaultData = {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    hotel: null,
    flights: [],
    notes: "",
    airportPickup: null,
    editPolicy: {
      hotel: "ADMIN",
      flights: "ADMIN",
      notes: "ADMIN",
    },
  };
  
  const data = readJson(travelFile, defaultData);
  const flightsCount = Array.isArray(data.flights) ? data.flights.length : 0;
  const hasHotel = !!(data.hotel && data.hotel.name);
  const hasPickup = !!data.airportPickup;
  
  console.log(`[TRAVEL GET] ========== START ==========`);
  console.log(`[TRAVEL GET] Request for patientId: ${patientId}`);
  console.log(`[TRAVEL GET] Travel file path: ${travelFile}`);
  console.log(`[TRAVEL GET] File exists: ${fs.existsSync(travelFile)}`);
  console.log(`[TRAVEL GET] Full data object:`, JSON.stringify(data, null, 2));
  console.log(`[TRAVEL GET] data.airportPickup:`, data?.airportPickup);
  console.log(`[TRAVEL GET] data.airportPickup type:`, typeof data?.airportPickup);
  console.log(`[TRAVEL GET] data.airportPickup !== undefined:`, data?.airportPickup !== undefined);
  console.log(`[TRAVEL GET] data.airportPickup !== null:`, data?.airportPickup !== null);
  console.log(`[TRAVEL GET] Response data summary:`, {
    patientId: data.patientId,
    hasHotel,
    flightsCount,
    hasPickup,
    hasNotes: !!(data.notes && data.notes.trim()),
    airportPickup: data?.airportPickup ? "present" : "null",
    airportPickupValue: data?.airportPickup,
  });
  console.log(`[TRAVEL GET] ========== END ==========`);
  
  res.json(data);
});

// POST /api/patient/:patientId/travel
app.post("/api/patient/:patientId/travel", (req, res) => {
  console.log(`[TRAVEL POST] ========== START ==========`);
  const patientId = req.params.patientId;
  console.log(`[TRAVEL POST] Request for patientId: ${patientId}`);
  console.log(`[TRAVEL POST] Request body keys:`, req.body ? Object.keys(req.body) : 'null');
  console.log(`[TRAVEL POST] Request body:`, JSON.stringify(req.body, null, 2));
  
  const TRAVEL_DIR = path.join(DATA_DIR, "travel");
  if (!fs.existsSync(TRAVEL_DIR)) {
    console.log(`[TRAVEL POST] Creating travel directory: ${TRAVEL_DIR}`);
    fs.mkdirSync(TRAVEL_DIR, { recursive: true });
  }
  
  const travelFile = path.join(TRAVEL_DIR, `${patientId}.json`);
  console.log(`[TRAVEL POST] Travel file path: ${travelFile}`);
  console.log(`[TRAVEL POST] File exists before: ${fs.existsSync(travelFile)}`);
  
  const existing = readJson(travelFile, {});
  console.log(`[TRAVEL POST] Existing data keys:`, Object.keys(existing));
  
  // Debug: airportPickup'ı kontrol et
  console.log(`[POST /travel/${patientId}] req.body type:`, typeof req.body);
  console.log(`[POST /travel/${patientId}] req.body keys:`, req.body ? Object.keys(req.body) : 'null');
  console.log(`[POST /travel/${patientId}] airportPickup in req.body:`, req.body?.airportPickup);
  console.log(`[POST /travel/${patientId}] airportPickup type:`, typeof req.body?.airportPickup);
  console.log(`[POST /travel/${patientId}] airportPickup !== undefined:`, req.body?.airportPickup !== undefined);
  console.log(`[POST /travel/${patientId}] existing airportPickup:`, existing?.airportPickup);
  
  // Eğer req.body'de hotel/flights/notes varsa kullan, yoksa mevcut verileri koru
  // airportPickup için: req.body'de varsa kullan, yoksa existing'den al, o da yoksa null
  let airportPickupValue = null;
  if (req.body?.airportPickup !== undefined) {
    airportPickupValue = req.body.airportPickup; // null, obje, veya başka bir değer olabilir
    console.log(`[POST /travel/${patientId}] Using req.body.airportPickup`);
  } else if (existing?.airportPickup !== undefined) {
    airportPickupValue = existing.airportPickup;
    console.log(`[POST /travel/${patientId}] Using existing.airportPickup`);
  } else {
    console.log(`[POST /travel/${patientId}] airportPickup will be null`);
  }
  
  console.log(`[POST /travel/${patientId}] airportPickupValue determined:`, JSON.stringify(airportPickupValue, null, 2));
  
  const payload = {
    schemaVersion: req.body?.schemaVersion || existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    hotel: req.body?.hotel !== undefined ? req.body.hotel : (existing.hotel || null),
    flights: req.body?.flights !== undefined 
      ? (Array.isArray(req.body.flights) ? req.body.flights : [])
      : (Array.isArray(existing.flights) ? existing.flights : []),
    notes: req.body?.notes !== undefined 
      ? String(req.body.notes || "")
      : String(existing.notes || ""),
    airportPickup: airportPickupValue,
    editPolicy: req.body?.editPolicy || existing.editPolicy || {
      hotel: "ADMIN",
      flights: "ADMIN",
      notes: "ADMIN",
    },
    events: req.body?.events !== undefined
      ? (Array.isArray(req.body.events) ? req.body.events : [])
      : (Array.isArray(existing.events) ? existing.events : []),
  };
  
  console.log(`[POST /travel/${patientId}] Final payload airportPickup:`, JSON.stringify(payload.airportPickup, null, 2));
  console.log(`[POST /travel/${patientId}] Full payload keys:`, Object.keys(payload));
  console.log(`[POST /travel/${patientId}] Payload has airportPickup:`, payload.hasOwnProperty('airportPickup'));
  console.log(`[POST /travel/${patientId}] Payload airportPickup type:`, typeof payload.airportPickup);
  console.log(`[POST /travel/${patientId}] Payload airportPickup value:`, payload.airportPickup);
  
  // airportPickup'ı her zaman payload'a ekle (null olsa bile)
  if (!payload.hasOwnProperty('airportPickup')) {
    console.log(`[POST /travel/${patientId}] WARNING: airportPickup missing from payload, adding null`);
    payload.airportPickup = null;
  }
  
  // Payload'ı JSON string'e çevirip kontrol et
  const payloadString = JSON.stringify(payload, null, 2);
  console.log(`[POST /travel/${patientId}] Payload JSON string contains airportPickup:`, payloadString.includes('airportPickup'));
  
  writeJson(travelFile, payload);
  console.log(`[TRAVEL POST] File written, verifying...`);
  const verify = readJson(travelFile, {});
  const flightsCount = Array.isArray(verify.flights) ? verify.flights.length : 0;
  const hasHotel = !!(verify.hotel && verify.hotel.name);
  const hasPickup = !!verify.airportPickup;
  
  console.log(`[TRAVEL POST] Verified data:`, {
    hasHotel,
    flightsCount,
    hasPickup,
    hasNotes: !!(verify.notes && verify.notes.trim()),
  });
  console.log(`[TRAVEL POST] ========== END ==========`);
  
  res.json({ ok: true, saved: true, travel: payload });
});

// ================== PATIENT TREATMENTS ==================
// GET /api/patient/:patientId/treatments
app.get("/api/patient/:patientId/treatments", (req, res) => {
  const patientId = req.params.patientId;
  const method = req.method;
  const url = req.url;
  const headers = req.headers;
  
  console.log(`[TREATMENTS GET] ========== START ==========`);
  console.log(`[TREATMENTS GET] Method: ${method}`);
  console.log(`[TREATMENTS GET] URL: ${url}`);
  console.log(`[TREATMENTS GET] Request for patientId: ${patientId}`);
  console.log(`[TREATMENTS GET] Headers:`, {
    authorization: headers.authorization ? "present" : "missing",
    "x-patient-token": headers["x-patient-token"] ? "present" : "missing",
    origin: headers.origin,
    "user-agent": headers["user-agent"]?.substring(0, 50),
  });
  
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) {
    console.log(`[TREATMENTS GET] Creating treatments directory: ${TREATMENTS_DIR}`);
    fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  }
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  console.log(`[TREATMENTS GET] Treatments file path: ${treatmentsFile}`);
  console.log(`[TREATMENTS GET] File exists: ${fs.existsSync(treatmentsFile)}`);
  
  const defaultData = {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    teeth: [],
  };
  
  const data = readJson(treatmentsFile, defaultData);
  const teethCount = data.teeth?.length || 0;
  const totalProcedures = data.teeth?.reduce((sum, t) => sum + (t.procedures?.length || 0), 0) || 0;
  
  console.log(`[TREATMENTS GET] Response data:`, {
    patientId: data.patientId,
    teethCount,
    totalProcedures,
  });
  console.log(`[TREATMENTS GET] ========== END ==========`);
  
  res.json(data);
});

// POST /api/patient/:patientId/treatments
app.post("/api/patient/:patientId/treatments", (req, res) => {
  console.log(`[TREATMENTS POST] ========== START ==========`);
  const patientId = req.params.patientId;
  console.log(`[TREATMENTS POST] Request for patientId: ${patientId}`);
  console.log(`[TREATMENTS POST] Request body:`, JSON.stringify(req.body, null, 2));
  
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) {
    console.log(`[TREATMENTS POST] Creating treatments directory: ${TREATMENTS_DIR}`);
    fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  }
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  console.log(`[TREATMENTS POST] Treatments file path: ${treatmentsFile}`);
  console.log(`[TREATMENTS POST] File exists before: ${fs.existsSync(treatmentsFile)}`);
  
  const existing = readJson(treatmentsFile, { teeth: [] });
  console.log(`[TREATMENTS POST] Existing teeth count: ${Array.isArray(existing.teeth) ? existing.teeth.length : 0}`);
  
  // Frontend'den gelen format: { toothId, procedure: { type, status, scheduledAt } }
  const { toothId, procedure } = req.body || {};
  
  if (!toothId || !procedure) {
    console.error(`[TREATMENTS POST] Missing toothId or procedure:`, { toothId: !!toothId, procedure: !!procedure });
    return res.status(400).json({ ok: false, error: "toothId and procedure required" });
  }
  
  // Mevcut teeth array'ini al
  let teeth = Array.isArray(existing.teeth) ? existing.teeth : [];
  
  // Bu toothId için mevcut tooth'u bul veya yeni oluştur
  let tooth = teeth.find((t) => String(t.toothId) === String(toothId));
  
  if (!tooth) {
    console.log(`[TREATMENTS POST] Creating new tooth entry for toothId: ${toothId}`);
    tooth = { toothId: String(toothId), procedures: [] };
    teeth.push(tooth);
  } else {
    console.log(`[TREATMENTS POST] Found existing tooth entry for toothId: ${toothId}, current procedures: ${Array.isArray(tooth.procedures) ? tooth.procedures.length : 0}`);
  }
  
  // Yeni procedure'ü ekle
  const newProcedure = {
    id: `${patientId}-${toothId}-${now()}`,
    type: String(procedure.type || ""),
    status: String(procedure.status || "PLANNED"),
    scheduledAt: procedure.scheduledAt ? Number(procedure.scheduledAt) : now(),
    createdAt: now(),
  };
  
  console.log(`[TREATMENTS POST] Adding new procedure:`, JSON.stringify(newProcedure, null, 2));
  
  if (!Array.isArray(tooth.procedures)) {
    tooth.procedures = [];
  }
  tooth.procedures.push(newProcedure);
  
  // Güncellenmiş data
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
  };
  
  console.log(`[TREATMENTS POST] Saving payload with ${teeth.length} teeth, total procedures: ${teeth.reduce((sum, t) => sum + (Array.isArray(t.procedures) ? t.procedures.length : 0), 0)}`);
  
  writeJson(treatmentsFile, payload);
  
  // Verify file was written
  const verify = readJson(treatmentsFile, {});
  console.log(`[TREATMENTS POST] File written, verified teeth count: ${Array.isArray(verify.teeth) ? verify.teeth.length : 0}`);
  console.log(`[TREATMENTS POST] ========== END ==========`);
  
  res.json({ ok: true, saved: true, treatments: payload });
});

// PUT /api/patient/:patientId/treatments/:procedureId
app.put("/api/patient/:patientId/treatments/:procedureId", (req, res) => {
  const patientId = req.params.patientId;
  const procedureId = req.params.procedureId;
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const existing = readJson(treatmentsFile, { teeth: [] });
  
  let teeth = Array.isArray(existing.teeth) ? existing.teeth : [];
  let found = false;
  
  // Procedure'ü bul ve güncelle
  for (const tooth of teeth) {
    if (Array.isArray(tooth.procedures)) {
      for (const proc of tooth.procedures) {
        if (String(proc.id) === String(procedureId)) {
          proc.type = String(req.body?.type || proc.type);
          proc.status = String(req.body?.status || proc.status);
          proc.scheduledAt = req.body?.scheduledAt ? Number(req.body.scheduledAt) : proc.scheduledAt;
          found = true;
          break;
        }
      }
    }
    if (found) break;
  }
  
  if (!found) {
    return res.status(404).json({ ok: false, error: "Procedure not found" });
  }
  
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
  };
  
  writeJson(treatmentsFile, payload);
  res.json({ ok: true, updated: true, treatments: payload });
});

// DELETE /api/patient/:patientId/treatments/:procedureId
app.delete("/api/patient/:patientId/treatments/:procedureId", (req, res) => {
  const patientId = req.params.patientId;
  const procedureId = req.params.procedureId;
  const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
  if (!fs.existsSync(TREATMENTS_DIR)) fs.mkdirSync(TREATMENTS_DIR, { recursive: true });
  
  const treatmentsFile = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const existing = readJson(treatmentsFile, { teeth: [] });
  
  let teeth = Array.isArray(existing.teeth) ? existing.teeth : [];
  let found = false;
  
  // Procedure'ü bul ve sil
  for (const tooth of teeth) {
    if (Array.isArray(tooth.procedures)) {
      const originalLength = tooth.procedures.length;
      tooth.procedures = tooth.procedures.filter((proc) => String(proc.id) !== String(procedureId));
      if (tooth.procedures.length < originalLength) {
        found = true;
        break;
      }
    }
  }
  
  if (!found) {
    return res.status(404).json({ ok: false, error: "Procedure not found" });
  }
  
  const payload = {
    schemaVersion: existing.schemaVersion || 1,
    updatedAt: now(),
    patientId,
    teeth,
  };
  
  writeJson(treatmentsFile, payload);
  res.json({ ok: true, deleted: true, treatments: payload });
});

// ================== CHAT MESSAGES ==================
// GET /api/patient/:patientId/messages
app.get("/api/patient/:patientId/messages", (req, res) => {
  try {
    const patientId = req.params.patientId;
    console.log("GET /api/patient/:patientId/messages - patientId:", patientId);
    
    if (!patientId) {
      console.warn("GET messages: patientId missing");
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    
    // Debug: log messages with attachment
    const attachmentMessages = messages.filter((m) => m.type === "attachment" || m.attachment);
    if (attachmentMessages.length > 0) {
      console.log(`[GET MESSAGES] Patient ${patientId} has ${attachmentMessages.length} attachment message(s):`);
      attachmentMessages.forEach((m, idx) => {
        console.log(`[GET MESSAGES] Attachment message ${idx + 1}:`, {
          id: m.id,
          type: m.type,
          hasAttachment: !!m.attachment,
          attachment: m.attachment,
          text: m.text,
        });
      });
    }
    
    console.log("GET messages: Returning", messages.length, "messages for patient", patientId);
    res.json({ ok: true, messages });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/patient/:patientId/messages
app.post("/api/patient/:patientId/messages", requireToken, (req, res) => {
  try {
    const patientId = req.params.patientId;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    // Body'yi güvenli şekilde oku
    const body = req.body || {};
    const text = String(body.text || "").trim();
    const type = String(body.type || "text").trim();
    const attachment = body.attachment || null;
    
    // OLD LOG FORMAT (for compatibility with existing logs)
    console.log("Patient message - patientId:", patientId, "text length:", text.length, "type:", type, "has attachment:", !!attachment, "body keys:", Object.keys(body));
    
    // NEW LOG FORMAT
    console.log("[MESSAGE] ========== START MESSAGE CREATION ==========");
    console.log("[MESSAGE] Patient ID:", patientId);
    console.log("[MESSAGE] Body keys:", Object.keys(body));
    console.log("[MESSAGE] Body.type:", body.type, "(raw)");
    console.log("[MESSAGE] Parsed type:", type);
    console.log("[MESSAGE] Body.attachment:", body.attachment ? "EXISTS" : "NULL");
    if (body.attachment) {
      console.log("[MESSAGE] Attachment details:", JSON.stringify(body.attachment, null, 2));
    }
    console.log("[MESSAGE] Text length:", text.length);
    console.log("[MESSAGE] ============================================");
    
    // For attachment messages, text can be empty but attachment must exist
    if (!text && type !== "attachment") {
      return res.status(400).json({ ok: false, error: "text_required", received: body });
    }
    
    if (type === "attachment" && !attachment) {
      return res.status(400).json({ ok: false, error: "attachment_required", received: body });
    }

    // Token'dan gelen patientId ile URL'deki patientId eşleşmeli
    if (req.patientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patientId_mismatch" });
    }

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    
    const newMessage = {
      id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
      text: String(text).trim(),
      type: type === "attachment" ? "attachment" : "text",
      from: "PATIENT",
      createdAt: now(),
      patientId: req.patientId,
    };
    
    console.log("[MESSAGE] newMessage before attachment:", JSON.stringify(newMessage, null, 2));
    
    // Add attachment if present
    // IMPORTANT: Check if attachment object exists, regardless of type field
    if (attachment && typeof attachment === "object") {
      console.log("[MESSAGE] ✅ ATTACHMENT DETECTED - Adding to message");
      newMessage.attachment = {
        id: String(attachment.id || ""),
        name: String(attachment.name || ""),
        mime: String(attachment.mime || ""),
        size: Number(attachment.size || 0),
        url: String(attachment.url || ""),
      };
      // Always set type to "attachment" if attachment exists
      newMessage.type = "attachment";
      console.log("[MESSAGE] ✅ Attachment added and type set to 'attachment':", JSON.stringify(newMessage.attachment, null, 2));
    } else if (type === "attachment") {
      console.log("[MESSAGE] ⚠️ Type is 'attachment' but no attachment object found");
      console.log("[MESSAGE] Attachment value:", attachment);
    } else {
      console.log("[MESSAGE] No attachment - type:", type, "attachment exists:", !!attachment);
    }
    
    messages.push(newMessage);
    
    const payload = {
      patientId,
      messages,
      updatedAt: now(),
    };
    
    writeJson(chatFile, payload);
    console.log("[MESSAGE] ✅ Message saved successfully");
    console.log("[MESSAGE] Final message:", JSON.stringify(newMessage, null, 2));
    
    // Verify the saved message by reading it back
    const verifyFile = readJson(chatFile, { messages: [] });
    const savedMessage = verifyFile.messages?.find((m) => m.id === newMessage.id);
    if (savedMessage) {
      console.log("[MESSAGE] ✅ Verified saved message:", JSON.stringify(savedMessage, null, 2));
    } else {
      console.log("[MESSAGE] ❌ WARNING: Saved message not found in file!");
    }
    
    console.log("[MESSAGE] ========== END MESSAGE CREATION ==========");
    res.json({ ok: true, message: newMessage });
  } catch (error) {
    console.error("Patient message send error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== FILE UPLOAD ==================
// Configure multer for file uploads
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const patientId = req.params.patientId;
    const patientUploadDir = path.join(UPLOADS_DIR, patientId);
    if (!fs.existsSync(patientUploadDir)) {
      fs.mkdirSync(patientUploadDir, { recursive: true });
    }
    cb(null, patientUploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp_random_originalname
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString("hex");
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${timestamp}_${random}_${safeName}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max (ZIP için yeterli, tek dosya için 15MB önerilir)
  },
  fileFilter: (req, file, cb) => {
    // Security: Block dangerous file types
    const dangerousExtensions = [".exe", ".js", ".sh", ".php", ".bat", ".cmd", ".com", ".scr", ".vbs", ".jar"];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (dangerousExtensions.includes(fileExt)) {
      return cb(new Error(`Dangerous file type blocked: ${fileExt}. Security policy violation.`));
    }
    
    // Allowed MIME types
    const allowedMimes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/heic", // iPhone photos
      "image/heif", // iPhone photos (alternative)
      // Documents
      "application/pdf",
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "text/plain", // .txt
      // Archives
      "application/zip",
    ];
    
    // Also check by extension for better security
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".heic", ".heif", ".pdf", ".doc", ".docx", ".txt", ".zip"];
    
    if (allowedMimes.includes(file.mimetype) && allowedExtensions.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${fileExt}). Allowed: ${allowedMimes.join(", ")}`));
    }
  },
});

// Test endpoint to verify upload route is loaded
app.get("/api/test/upload-route", (req, res) => {
  res.json({ ok: true, message: "Upload route is loaded", multer: typeof multer !== "undefined" });
});

// POST /api/patient/:patientId/upload
// Upload file (ONLY patients can upload, NOT admins)
// Requires patient token, but NOT requireApproved - PENDING patients can upload
app.post("/api/patient/:patientId/upload", requireToken, (req, res, next) => {
  console.log(`[UPLOAD] ========== START ==========`);
  console.log(`[UPLOAD] Patient ID from URL: ${req.params.patientId}`);
  console.log(`[UPLOAD] Patient ID from token: ${req.patientId}`);
  console.log(`[UPLOAD] Content-Type: ${req.headers["content-type"]}`);
  console.log(`[UPLOAD] Content-Length: ${req.headers["content-length"]}`);
  console.log(`[UPLOAD] Method: ${req.method}`);
  console.log(`[UPLOAD] URL: ${req.url}`);
  console.log(`[UPLOAD] Headers:`, JSON.stringify(req.headers, null, 2));
  next();
}, upload.single("file"), (req, res) => {
  try {
    const patientId = req.params.patientId;
    
    console.log(`[UPLOAD] Processing upload for patient: ${patientId}`);
    
    if (!patientId) {
      console.log(`[UPLOAD] Error: patientId_required`);
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    // Token'dan gelen patientId ile URL'deki patientId eşleşmeli
    if (req.patientId !== patientId) {
      console.log(`[UPLOAD] Error: patientId_mismatch (token: ${req.patientId}, url: ${patientId})`);
      return res.status(403).json({ ok: false, error: "patientId_mismatch" });
    }
    
    if (!req.file) {
      console.log(`[UPLOAD] Error: file_required`);
      console.log(`[UPLOAD] Request body keys:`, Object.keys(req.body || {}));
      console.log(`[UPLOAD] Request files:`, req.files);
      return res.status(400).json({ ok: false, error: "file_required", received: { body: req.body, files: req.files } });
    }
    
    const file = req.file;
    const fileId = `file_${now()}_${crypto.randomBytes(4).toString("hex")}`;
    const downloadUrl = `/api/patient/${patientId}/files/${file.filename}`;
    
    console.log(`[UPLOAD] ✅ Success: Patient ${patientId} uploaded file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    console.log(`[UPLOAD] Saved to: ${file.path}`);
    console.log(`[UPLOAD] Download URL: ${downloadUrl}`);
    console.log(`[UPLOAD] ========== END ==========`);
    
    res.json({
      ok: true,
      file: {
        id: fileId,
        name: file.originalname,
        mime: file.mimetype,
        size: file.size,
        url: downloadUrl,
      },
    });
  } catch (error) {
    console.error(`[UPLOAD] ❌ Error:`, error);
    console.error(`[UPLOAD] Error stack:`, error?.stack);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
}, (error, req, res, next) => {
  // Multer error handler
  console.error(`[UPLOAD] ❌ Multer error:`, error);
  console.error(`[UPLOAD] Multer error details:`, {
    message: error?.message,
    name: error?.name,
    code: error?.code,
    field: error?.field,
  });
  
  if (error instanceof multer.MulterError) {
    console.error(`[UPLOAD] Multer error code: ${error.code}`);
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ ok: false, error: "file_too_large", message: "File size exceeds 100MB limit. For large files, please use ZIP or share via Google Drive/WeTransfer link." });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ ok: false, error: "unexpected_file_field", message: `Unexpected file field: ${error.field}. Expected: "file"` });
    }
    return res.status(400).json({ ok: false, error: error.code, message: error.message });
  }
  if (error) {
    return res.status(400).json({ ok: false, error: "upload_error", message: error.message });
  }
  next();
});

// GET /api/patient/:patientId/files/:filename
// Secure file download (both patient and admin can download)
// Patient: can download their own files
// Admin: can download files of patients in their clinic
// Supports both Authorization header and ?token= query parameter (for React Native Linking)
app.get("/api/patient/:patientId/files/:filename", (req, res) => {
  try {
    const patientId = req.params.patientId;
    const filename = req.params.filename;
    
    if (!patientId || !filename) {
      return res.status(400).json({ ok: false, error: "patientId_and_filename_required" });
    }
    
    // Get token from header or query parameter
    const auth = req.headers.authorization || "";
    const tokenFromHeader = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const tokenFromQuery = req.query.token || "";
    const finalToken = tokenFromHeader || tokenFromQuery;
    
    if (!finalToken) {
      console.log("[DOWNLOAD] Missing token");
      return res.status(401).json({ ok: false, error: "missing_token" });
    }
    
    // Try patient token first
    const tokens = readJson(TOK_FILE, {});
    const t = tokens[finalToken];
    let isAuthorized = false;
    
    if (t?.patientId) {
      // Patient token: patientId must match
      if (t.patientId === patientId) {
        isAuthorized = true;
        console.log(`[DOWNLOAD] Patient ${patientId} authorized via patient token`);
      } else {
        console.log(`[DOWNLOAD] Patient ID mismatch: token=${t.patientId}, url=${patientId}`);
      }
    }
    
    // If not authorized with patient token, try admin token
    if (!isAuthorized) {
      console.log(`[DOWNLOAD] Patient token not authorized, trying admin token...`);
      try {
        // First try JWT verification (most common for admin tokens)
        try {
          const decoded = jwt.verify(finalToken, JWT_SECRET);
          console.log(`[DOWNLOAD] JWT decoded successfully:`, { clinicCode: decoded.clinicCode, clinicId: decoded.clinicId });
          if (decoded.clinicCode) {
            // Admin with JWT token - allow access to any patient in their clinic
            const patients = readJson(PAT_FILE, {});
            const patient = patients[patientId];
            console.log(`[DOWNLOAD] Patient lookup:`, { patientId, patientClinicCode: patient?.clinicCode, adminClinicCode: decoded.clinicCode });
            if (patient && patient.clinicCode && String(patient.clinicCode).toUpperCase() === String(decoded.clinicCode).toUpperCase()) {
              isAuthorized = true;
              console.log(`[DOWNLOAD] ✅ Admin authorized via JWT for patient ${patientId} (clinic: ${decoded.clinicCode})`);
            } else {
              console.log(`[DOWNLOAD] ❌ Clinic code mismatch: patient=${patient?.clinicCode}, admin=${decoded.clinicCode}`);
            }
          }
        } catch (jwtError) {
          console.log(`[DOWNLOAD] JWT verification failed (not a JWT token or invalid):`, jwtError.message);
          // Not a JWT token, try admin tokens file
          const adminTokens = readJson(ADMIN_TOKENS_FILE, {});
          const adminTokenData = adminTokens[finalToken];
          if (adminTokenData?.clinicCode) {
            console.log(`[DOWNLOAD] Found admin token in adminTokens.json:`, { clinicCode: adminTokenData.clinicCode });
            // Admin token: check if patient belongs to this clinic
            const patients = readJson(PAT_FILE, {});
            const patient = patients[patientId];
            console.log(`[DOWNLOAD] Patient lookup:`, { patientId, patientClinicCode: patient?.clinicCode, adminClinicCode: adminTokenData.clinicCode });
            if (patient && patient.clinicCode && String(patient.clinicCode).toUpperCase() === String(adminTokenData.clinicCode).toUpperCase()) {
              isAuthorized = true;
              console.log(`[DOWNLOAD] ✅ Admin authorized for patient ${patientId} (clinic: ${adminTokenData.clinicCode})`);
            } else {
              console.log(`[DOWNLOAD] ❌ Clinic code mismatch: patient=${patient?.clinicCode}, admin=${adminTokenData.clinicCode}`);
            }
          } else {
            console.log(`[DOWNLOAD] ❌ Admin token not found in adminTokens.json`);
          }
        }
      } catch (adminError) {
        console.error("[DOWNLOAD] Admin token check error:", adminError);
      }
    }
    
    if (!isAuthorized) {
      console.log(`[DOWNLOAD] Unauthorized: token=${finalToken.substring(0, 10)}...`);
      return res.status(403).json({ ok: false, error: "unauthorized" });
    }
    
    // Security: Prevent path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ ok: false, error: "invalid_filename" });
    }
    
    const filePath = path.join(UPLOADS_DIR, patientId, filename);
    
    if (!fs.existsSync(filePath)) {
      console.log(`[DOWNLOAD] File not found: ${filePath}`);
      return res.status(404).json({ ok: false, error: "file_not_found" });
    }
    
    console.log(`[DOWNLOAD] Patient ${patientId} downloading file: ${filename}`);
    
    // Set appropriate content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypeMap = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".pdf": "application/pdf",
      ".zip": "application/zip",
    };
    const contentType = contentTypeMap[ext] || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error("File download error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/patient/:patientId/messages/admin (Admin mesaj gönderir)
app.post("/api/patient/:patientId/messages/admin", (req, res) => {
  try {
    const patientId = req.params.patientId;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    // Body'yi güvenli şekilde oku
    const body = req.body || {};
    const text = String(body.text || "").trim();
    
    console.log("Admin message - patientId:", patientId, "text length:", text.length, "body keys:", Object.keys(body));
    
    if (!text) {
      return res.status(400).json({ ok: false, error: "text_required", received: body });
    }

    const CHAT_DIR = path.join(DATA_DIR, "chats");
    if (!fs.existsSync(CHAT_DIR)) fs.mkdirSync(CHAT_DIR, { recursive: true });

    const chatFile = path.join(CHAT_DIR, `${patientId}.json`);
    const existing = readJson(chatFile, { messages: [] });
    
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    
    const newMessage = {
      id: `msg_${now()}_${crypto.randomBytes(4).toString("hex")}`,
      text: String(text).trim(),
      from: "CLINIC",
      createdAt: now(),
    };
    
    messages.push(newMessage);
    
    const payload = {
      patientId,
      messages,
      updatedAt: now(),
    };
    
    writeJson(chatFile, payload);
    res.json({ ok: true, message: newMessage });
  } catch (error) {
    console.error("Admin message send error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== CLINIC INFO ==================
// GET /api/clinic (Public - mobile app için)
// Query parameter olarak ?code=KAKA gibi clinic code alabilir
app.get("/api/clinic", async (req, res) => {
  const code = req.query.code ? String(req.query.code).toUpperCase().trim() : null;
  
  // If clinic code provided, use /api/clinic/:code logic
  if (code) {
    let clinic = null;
    
    // Try Supabase first (if available)
    if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
      console.log(`[CLINIC] GET /api/clinic?code=${code} - Checking Supabase...`);
      const supabaseClinic = await supabase.getClinicByCode(code);
      if (supabaseClinic) {
        console.log(`[CLINIC] ✅ Found clinic "${code}" in Supabase`);
        // Convert Supabase format to JSON format (snake_case to camelCase)
        clinic = {
          clinicCode: supabaseClinic.clinic_code,
          name: supabaseClinic.name,
          email: supabaseClinic.email,
          address: supabaseClinic.address || "",
          phone: supabaseClinic.phone || "",
          website: supabaseClinic.website || "",
          logoUrl: supabaseClinic.logo_url || "",
          googleMapsUrl: supabaseClinic.google_maps_url || "",
          defaultInviterDiscountPercent: supabaseClinic.default_inviter_discount_percent,
          defaultInvitedDiscountPercent: supabaseClinic.default_invited_discount_percent,
          createdAt: supabaseClinic.created_at,
          updatedAt: supabaseClinic.updated_at,
        };
      }
    }
    
    // Fallback to JSON files if not found in Supabase
    if (!clinic) {
      // First check clinics.json (multi-clinic support)
      const clinics = readJson(CLINICS_FILE, {});
      clinic = clinics[code];
      
      // If not found in clinics.json, check clinic.json (backward compatibility)
      if (!clinic) {
        const singleClinic = readJson(CLINIC_FILE, {});
        if (singleClinic.clinicCode && singleClinic.clinicCode.toUpperCase() === code) {
          clinic = singleClinic;
        }
      }
    }
    
    // If found, return clinic info (without password)
    if (clinic) {
      const { password, ...publicClinic } = clinic;
      return res.json(publicClinic);
    }
    
    // If no match, return 404
    return res.status(404).json({ ok: false, error: "clinic_not_found", code });
  }
  
  // If no code provided, return default (backward compatibility)
  const defaultClinic = {
    clinicCode: "MOON",
    name: "Cliniflow Dental Clinic",
    googleReviews: [],
    trustpilotReviews: [],
    address: "Antalya, Türkiye",
    phone: "",
    email: "",
    website: "",
    logoUrl: "",
    googleMapsUrl: "",
    defaultInviterDiscountPercent: null,
    defaultInvitedDiscountPercent: null,
    updatedAt: now(),
  };
  
  const clinic = readJson(CLINIC_FILE, defaultClinic);
  res.json(clinic);
});

// GET /api/clinic/:code (Public - get clinic by code)
app.get("/api/clinic/:code", async (req, res) => {
  const code = String(req.params.code || "").toUpperCase().trim();
  console.log(`[CLINIC] GET /api/clinic/:code - Requested code: "${code}"`);
  
  if (!code) {
    console.log(`[CLINIC] ❌ No clinic code provided`);
    return res.status(400).json({ ok: false, error: "clinic_code_required" });
  }
  
  let clinic = null;
  
  // Try Supabase first (if available)
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    console.log(`[CLINIC] Checking Supabase for clinic "${code}"...`);
    clinic = await supabase.getClinicByCode(code);
    if (clinic) {
      console.log(`[CLINIC] ✅ Found clinic "${code}" in Supabase`);
      console.log(`[CLINIC] Clinic data from Supabase:`, {
        name: clinic.name,
        address: clinic.address || "empty",
        phone: clinic.phone || "empty",
        logo_url: clinic.logo_url || "empty",
        website: clinic.website || "empty",
      });
      // Convert Supabase format to JSON format (snake_case to camelCase)
      const publicClinic = {
        clinicCode: clinic.clinic_code,
        name: clinic.name,
        email: clinic.email,
        address: clinic.address || "",
        phone: clinic.phone || "",
        website: clinic.website || "",
        logoUrl: clinic.logo_url || "",
        googleMapsUrl: clinic.google_maps_url || "",
        defaultInviterDiscountPercent: clinic.default_inviter_discount_percent,
        defaultInvitedDiscountPercent: clinic.default_invited_discount_percent,
        createdAt: clinic.created_at,
        updatedAt: clinic.updated_at,
      };
      console.log(`[CLINIC] Returning clinic data:`, {
        name: publicClinic.name,
        address: publicClinic.address || "empty",
        phone: publicClinic.phone || "empty",
        logoUrl: publicClinic.logoUrl || "empty",
      });
      return res.json(publicClinic);
    }
  }
  
  console.log(`[CLINIC] CLINICS_FILE path: ${CLINICS_FILE}`);
  console.log(`[CLINIC] CLINICS_FILE exists: ${fs.existsSync(CLINICS_FILE)}`);
  
  // Fallback to clinics.json (multi-clinic support)
  const clinics = readJson(CLINICS_FILE, {});
  console.log(`[CLINIC] clinics.json keys:`, Object.keys(clinics));
  clinic = clinics[code];
  
  // If not found in clinics.json, check clinic.json (backward compatibility)
  if (!clinic) {
    console.log(`[CLINIC] Clinic "${code}" not found in clinics.json, checking clinic.json...`);
    const singleClinic = readJson(CLINIC_FILE, {});
    console.log(`[CLINIC] clinic.json clinicCode:`, singleClinic.clinicCode);
    if (singleClinic.clinicCode && singleClinic.clinicCode.toUpperCase() === code) {
      clinic = singleClinic;
      console.log(`[CLINIC] ✅ Found clinic "${code}" in clinic.json`);
    } else {
      console.log(`[CLINIC] ❌ Clinic "${code}" not found in either file`);
    }
  } else {
    console.log(`[CLINIC] ✅ Found clinic "${code}" in clinics.json`);
  }
  
  // If found, return clinic info (without password)
  if (clinic) {
    const { password, ...publicClinic } = clinic;
    console.log(`[CLINIC] ✅ Returning clinic info for "${code}":`, {
      name: publicClinic.name,
      clinicCode: publicClinic.clinicCode,
      email: publicClinic.email ? "***" : null,
    });
    return res.json(publicClinic);
  }
  
  // If no match, return 404
  console.log(`[CLINIC] ❌ Clinic "${code}" not found. Available clinics:`, Object.keys(clinics));
  res.status(404).json({ ok: false, error: "clinic_not_found", code });
});

// GET /api/admin/clinic (Admin için) - Returns clinic info for the logged-in clinic
app.get("/api/admin/clinic", requireAdmin, async (req, res) => {
  const clinicCode = req.clinicCode;
  console.log(`[GET /api/admin/clinic] Clinic code from token: ${clinicCode}`);
  
  let clinic = null;
  
  // Try Supabase first (if available) - this is the source of truth
  if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
    console.log(`[GET /api/admin/clinic] Checking Supabase for clinic "${clinicCode}"...`);
    const supabaseClinic = await supabase.getClinicByCode(clinicCode);
    if (supabaseClinic) {
      console.log(`[GET /api/admin/clinic] ✅ Found clinic "${clinicCode}" in Supabase`);
      // Convert snake_case to camelCase for frontend
      clinic = {
        clinicCode: supabaseClinic.clinic_code || clinicCode,
        name: supabaseClinic.name || "",
        email: supabaseClinic.email || "",
        address: supabaseClinic.address || "",
        phone: supabaseClinic.phone || "",
        website: supabaseClinic.website || "",
        logoUrl: supabaseClinic.logo_url || "",
        googleMapsUrl: supabaseClinic.google_maps_url || "",
        defaultInviterDiscountPercent: supabaseClinic.default_inviter_discount_percent,
        defaultInvitedDiscountPercent: supabaseClinic.default_invited_discount_percent,
        createdAt: supabaseClinic.created_at,
        updatedAt: supabaseClinic.updated_at,
      };
      console.log(`[GET /api/admin/clinic] Returning clinic data from Supabase:`, {
        name: clinic.name,
        address: clinic.address || "empty",
        phone: clinic.phone || "empty",
        logoUrl: clinic.logoUrl || "empty",
      });
    } else {
      console.log(`[GET /api/admin/clinic] Clinic "${clinicCode}" not found in Supabase, falling back to JSON files`);
    }
  }
  
  // Fallback to JSON files if Supabase not available or clinic not found
  if (!clinic) {
    console.log(`[GET /api/admin/clinic] Checking JSON files for clinic "${clinicCode}"...`);
    // First check clinics.json (multi-clinic support)
    const clinics = readJson(CLINICS_FILE, {});
    clinic = clinics[clinicCode];
    
    // If not found in clinics.json, check clinic.json (backward compatibility)
    if (!clinic) {
      const singleClinic = readJson(CLINIC_FILE, {});
      if (singleClinic.clinicCode && singleClinic.clinicCode.toUpperCase() === clinicCode) {
        clinic = singleClinic;
      }
    }
    
    // If still not found, return default structure
    if (!clinic) {
      clinic = {
        clinicCode: clinicCode,
        name: "",
        address: "",
        phone: "",
        email: "",
        website: "",
        logoUrl: "",
        googleMapsUrl: "",
        defaultInviterDiscountPercent: null,
        defaultInvitedDiscountPercent: null,
        updatedAt: now(),
      };
    }
    console.log(`[GET /api/admin/clinic] Returning clinic data from JSON files:`, {
      name: clinic.name,
      address: clinic.address || "empty",
      phone: clinic.phone || "empty",
      logoUrl: clinic.logoUrl || "empty",
    });
  }
  
  // Don't return password hash
  const { password, ...publicClinic } = clinic;
  res.json(publicClinic);
});

// PUT /api/admin/clinic (Admin günceller) - Only updates the logged-in clinic
app.put("/api/admin/clinic", requireAdmin, async (req, res) => {
  const clinicCode = req.clinicCode;
  console.log(`\n\n[PUT /api/admin/clinic] ========== START ==========`);
  console.log(`[PUT /api/admin/clinic] Clinic code from token: ${clinicCode}`);
  console.log(`[PUT /api/admin/clinic] Request body keys:`, Object.keys(req.body || {}));
  console.log(`[PUT /api/admin/clinic] Request body:`, JSON.stringify(req.body || {}, null, 2));
  console.log(`[PUT /api/admin/clinic] Request headers:`, JSON.stringify(req.headers, null, 2));
  try {
    const body = req.body || {};
    console.log(`[PUT /api/admin/clinic] Body data:`, {
      name: body.name || "not provided",
      address: body.address || "not provided",
      phone: body.phone || "not provided",
      logoUrl: body.logoUrl || "not provided",
      website: body.website || "not provided",
    });
    
    // Get existing clinic data - prioritize Supabase, then JSON files
    let existing = {};
    let existingSupabaseClinic = null;
    
    if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
      console.log(`[PUT /api/admin/clinic] Checking Supabase for clinic "${clinicCode}"...`);
      existingSupabaseClinic = await supabase.getClinicByCode(clinicCode);
      if (existingSupabaseClinic) {
        console.log(`[PUT /api/admin/clinic] ✅ Found existing clinic in Supabase`);
        console.log(`[PUT /api/admin/clinic] Existing Supabase clinic data:`, {
          name: existingSupabaseClinic.name || "empty",
          address: existingSupabaseClinic.address || "empty",
          phone: existingSupabaseClinic.phone || "empty",
          logo_url: existingSupabaseClinic.logo_url || "empty",
          website: existingSupabaseClinic.website || "empty",
        });
        // Convert snake_case to camelCase for merging
        existing = {
          clinicCode: existingSupabaseClinic.clinic_code,
          name: existingSupabaseClinic.name || "",
          email: existingSupabaseClinic.email || "",
          password: existingSupabaseClinic.password || "", // Required for Supabase updates
          address: existingSupabaseClinic.address || "",
          phone: existingSupabaseClinic.phone || "",
          website: existingSupabaseClinic.website || "",
          logoUrl: existingSupabaseClinic.logo_url || "",
          googleMapsUrl: existingSupabaseClinic.google_maps_url || "",
          defaultInviterDiscountPercent: existingSupabaseClinic.default_inviter_discount_percent,
          defaultInvitedDiscountPercent: existingSupabaseClinic.default_invited_discount_percent,
          createdAt: existingSupabaseClinic.created_at,
          updatedAt: existingSupabaseClinic.updated_at,
        };
        console.log(`[PUT /api/admin/clinic] Converted existing data (camelCase):`, {
          name: existing.name || "empty",
          address: existing.address || "empty",
          phone: existing.phone || "empty",
          logoUrl: existing.logoUrl || "empty",
          website: existing.website || "empty",
        });
      } else {
        console.log(`[PUT /api/admin/clinic] ⚠️  Clinic "${clinicCode}" not found in Supabase`);
      }
    }
    
    // Fallback to JSON files if Supabase not available or clinic not found there
    if (!existingSupabaseClinic) {
      console.log(`[PUT /api/admin/clinic] Checking JSON files for existing clinic data...`);
      const clinics = readJson(CLINICS_FILE, {});
      existing = clinics[clinicCode] || {};
      
      if (!existing || Object.keys(existing).length === 0) {
        const singleClinic = readJson(CLINIC_FILE, {});
        if (singleClinic.clinicCode && singleClinic.clinicCode.toUpperCase() === clinicCode) {
          existing = singleClinic;
        }
      }
    }
    
    const inviterPercent = body.defaultInviterDiscountPercent != null 
      ? Number(body.defaultInviterDiscountPercent) 
      : (existing.defaultInviterDiscountPercent != null ? existing.defaultInviterDiscountPercent : null);
    const invitedPercent = body.defaultInvitedDiscountPercent != null 
      ? Number(body.defaultInvitedDiscountPercent) 
      : (existing.defaultInvitedDiscountPercent != null ? existing.defaultInvitedDiscountPercent : null);
    
    // Validasyon
    if (inviterPercent != null && (Number.isNaN(inviterPercent) || inviterPercent < 0 || inviterPercent > 99)) {
      return res.status(400).json({ ok: false, error: "defaultInviterDiscountPercent must be 0-99" });
    }
    if (invitedPercent != null && (Number.isNaN(invitedPercent) || invitedPercent < 0 || invitedPercent > 99)) {
      return res.status(400).json({ ok: false, error: "defaultInvitedDiscountPercent must be 0-99" });
    }
    
    // Handle password change
    let passwordHash = existing.password;
    if (body.password && String(body.password).trim()) {
      // New password provided, hash it
      passwordHash = await bcrypt.hash(String(body.password).trim(), 10);
    }
    
    const updated = {
      ...existing,
      clinicCode: clinicCode, // Use clinic code from token, not from body
      name: String(body.name !== undefined ? body.name : (existing.name || "")),
      address: String(body.address !== undefined ? body.address : (existing.address || "")),
      phone: String(body.phone !== undefined ? body.phone : (existing.phone || "")),
      email: String(body.email !== undefined ? body.email : (existing.email || "")),
      website: String(body.website !== undefined ? body.website : (existing.website || "")),
      logoUrl: String(body.logoUrl !== undefined ? body.logoUrl : (existing.logoUrl || "")),
      googleMapsUrl: String(body.googleMapsUrl !== undefined ? body.googleMapsUrl : (existing.googleMapsUrl || "")),
      defaultInviterDiscountPercent: inviterPercent,
      defaultInvitedDiscountPercent: invitedPercent,
      googleReviews: Array.isArray(body.googleReviews) ? body.googleReviews : (existing.googleReviews || []),
      trustpilotReviews: Array.isArray(body.trustpilotReviews) ? body.trustpilotReviews : (existing.trustpilotReviews || []),
      password: passwordHash, // Keep existing or update
      createdAt: existing.createdAt || now(), // Preserve existing createdAt or use current time
      updatedAt: now(),
    };
    
    console.log(`[PUT /api/admin/clinic] Updated object (before Supabase update):`, {
      name: updated.name,
      address: updated.address || "empty",
      phone: updated.phone || "empty",
      logoUrl: updated.logoUrl || "empty",
      website: updated.website || "empty",
      email: updated.email || "empty",
    });
    console.log(`[PUT /api/admin/clinic] Body values received from admin panel:`, {
      name: body.name !== undefined ? (body.name || "empty string") : "undefined",
      address: body.address !== undefined ? (body.address || "empty string") : "undefined",
      phone: body.phone !== undefined ? (body.phone || "empty string") : "undefined",
      logoUrl: body.logoUrl !== undefined ? (body.logoUrl || "empty string") : "undefined",
      website: body.website !== undefined ? (body.website || "empty string") : "undefined",
    });
    console.log(`[PUT /api/admin/clinic] Existing data (before merge):`, {
      name: existing.name || "empty",
      address: existing.address || "empty",
      phone: existing.phone || "empty",
      logoUrl: existing.logoUrl || "empty",
      website: existing.website || "empty",
    });
    
    // Save to Supabase first (if available)
    if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
      console.log(`[PUT /api/admin/clinic] ✅ Supabase is available, proceeding with update...`);
      console.log(`[PUT /api/admin/clinic] Updating clinic "${clinicCode}" in Supabase...`);
      try {
        // Use existingSupabaseClinic that we already fetched above
        console.log(`[PUT /api/admin/clinic] Existing Supabase clinic:`, existingSupabaseClinic ? "found" : "not found");
        
        // Convert camelCase to snake_case for Supabase
        // Use updated object which already merges body + existing data
        // If admin panel sends empty string, it will be saved as empty (user wants to clear the field)
        // If admin panel doesn't send a field, existing value is preserved
        // Note: password field is required in Supabase schema, so we must include it
        // If password was changed, updated.password contains the new hash, otherwise use existing
        // NOTE: clinic_code is NOT included in updates because it's the primary key (used in WHERE clause)
        const supabaseUpdates = {
          name: updated.name || "",
          email: updated.email || "",
          password: updated.password || existingSupabaseClinic?.password || "", // Required field, use existing if not changed
          address: updated.address || "",
          phone: updated.phone || "",
          website: updated.website || "",
          logo_url: updated.logoUrl || "",
          google_maps_url: updated.googleMapsUrl || "",
          default_inviter_discount_percent: updated.defaultInviterDiscountPercent !== undefined ? updated.defaultInviterDiscountPercent : null,
          default_invited_discount_percent: updated.defaultInvitedDiscountPercent !== undefined ? updated.defaultInvitedDiscountPercent : null,
          updated_at: updated.updatedAt,
        };
        
        console.log(`[PUT /api/admin/clinic] Supabase update payload:`, {
          name: supabaseUpdates.name,
          address: supabaseUpdates.address || "empty",
          phone: supabaseUpdates.phone || "empty",
          logo_url: supabaseUpdates.logo_url || "empty",
          website: supabaseUpdates.website || "empty",
        });
        
        // Use direct Supabase upsert with explicit field mapping
        // This ensures ALL fields are saved, including phone, address, website, logo_url
        const upsertPayload = {
          clinic_code: clinicCode.toUpperCase(),
          name: updated.name ?? "",
          email: updated.email ?? "",
          password: updated.password || existingSupabaseClinic?.password || "", // Required field
          address: updated.address ?? "", // Use ?? to ensure empty string if null/undefined
          phone: updated.phone ?? "", // Use ?? to ensure empty string if null/undefined
          website: updated.website ?? "", // Use ?? to ensure empty string if null/undefined
          logo_url: updated.logoUrl ?? "", // Use ?? to ensure empty string if null/undefined
          google_maps_url: updated.googleMapsUrl ?? "",
          default_inviter_discount_percent: updated.defaultInviterDiscountPercent ?? null,
          default_invited_discount_percent: updated.defaultInvitedDiscountPercent ?? null,
          google_reviews: Array.isArray(updated.googleReviews) ? updated.googleReviews : [],
          trustpilot_reviews: Array.isArray(updated.trustpilotReviews) ? updated.trustpilotReviews : [],
          created_at: existingSupabaseClinic?.created_at || updated.createdAt || updated.updatedAt, // Preserve existing created_at
          updated_at: updated.updatedAt,
        };
        
        console.log(`[PUT /api/admin/clinic] Upsert payload:`, {
          clinic_code: upsertPayload.clinic_code,
          name: upsertPayload.name || "empty",
          address: upsertPayload.address || "empty",
          phone: upsertPayload.phone || "empty",
          logo_url: upsertPayload.logo_url || "empty",
          website: upsertPayload.website || "empty",
        });
        console.log(`[PUT /api/admin/clinic] Full upsert payload (JSON):`, JSON.stringify(upsertPayload, null, 2));
        
        // Direct Supabase upsert call (using ?? operator to ensure empty strings)
        let supabaseResult = null;
        const { data: directUpsertData, error: supabaseUpsertError } = await supabase
          .from("clinics")
          .upsert(upsertPayload, { onConflict: "clinic_code" })
          .select()
          .single();
        
        if (supabaseUpsertError) {
          console.error(`[PUT /api/admin/clinic] ❌ Direct Supabase upsert error:`, supabaseUpsertError);
          console.error(`[PUT /api/admin/clinic] Error details:`, JSON.stringify(supabaseUpsertError, null, 2));
          console.error(`[PUT /api/admin/clinic] Upsert payload was:`, JSON.stringify(upsertPayload, null, 2));
          // Fall back to supabase.upsertClinic helper
          console.log(`[PUT /api/admin/clinic] Falling back to upsertClinic helper...`);
          const fallbackResult = await supabase.upsertClinic(upsertPayload);
          if (fallbackResult) {
            console.log(`[PUT /api/admin/clinic] ✅ Fallback upsertClinic succeeded`);
            supabaseResult = fallbackResult;
          } else {
            console.error(`[PUT /api/admin/clinic] ❌ Fallback also failed`);
          }
        } else {
          console.log(`[PUT /api/admin/clinic] ✅ Direct Supabase upsert succeeded`);
          supabaseResult = directUpsertData;
        }
        if (supabaseResult) {
          console.log(`[PUT /api/admin/clinic] ✅ Successfully upserted clinic "${clinicCode}" in Supabase`);
          console.log(`[PUT /api/admin/clinic] Upserted clinic data from Supabase:`, {
            name: supabaseResult.name,
            address: supabaseResult.address || "empty",
            phone: supabaseResult.phone || "empty",
            logo_url: supabaseResult.logo_url || "empty",
            website: supabaseResult.website || "empty",
          });
        } else {
          console.error(`[PUT /api/admin/clinic] ❌ Failed to upsert clinic "${clinicCode}" in Supabase`);
          console.error(`[PUT /api/admin/clinic] Upsert payload was:`, JSON.stringify(upsertData, null, 2));
        }
      } catch (supabaseError) {
        console.error(`[PUT /api/admin/clinic] ❌ Supabase update error:`, supabaseError);
        console.warn(`[PUT /api/admin/clinic] ⚠️  Continuing with JSON fallback`);
      }
    }
    
    // Save to clinics.json (multi-clinic support) - fallback or additional storage
    const clinics = readJson(CLINICS_FILE, {});
    clinics[clinicCode] = updated;
    writeJson(CLINICS_FILE, clinics);
    console.log(`[PUT /api/admin/clinic] ✅ Saved clinic "${clinicCode}" to clinics.json`);
    
    // Also update clinic.json if it matches (backward compatibility)
    const singleClinic = readJson(CLINIC_FILE, {});
    if (singleClinic.clinicCode && singleClinic.clinicCode.toUpperCase() === clinicCode) {
      writeJson(CLINIC_FILE, updated);
      console.log(`[PUT /api/admin/clinic] ✅ Also saved clinic "${clinicCode}" to clinic.json (backward compatibility)`);
    }
    
    // Don't return password hash
    const { password, ...publicClinic } = updated;
    console.log(`[PUT /api/admin/clinic] ========== END (SUCCESS) ==========`);
    res.json({ ok: true, clinic: publicClinic });
  } catch (error) {
    console.error(`[PUT /api/admin/clinic] ========== END (ERROR) ==========`);
    console.error("[PUT /api/admin/clinic] Clinic update error:", error);
    console.error("[PUT /api/admin/clinic] Error stack:", error?.stack);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== REVIEWS IMPORT ==================
// POST /api/admin/reviews/import/google
app.post("/api/admin/reviews/import/google", (req, res) => {
  const { placeId, apiKey } = req.body || {};
  
  if (!placeId || !placeId.trim()) {
    return res.status(400).json({ ok: false, error: "placeId_required" });
  }
  
  const key = apiKey || process.env.GOOGLE_PLACES_API_KEY || "";
  if (!key || !key.trim()) {
    return res.status(400).json({ ok: false, error: "api_key_required" });
  }
  
  // Google Places API Details endpoint
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,reviews&key=${encodeURIComponent(key)}`;
  
  // Use https module for Node.js compatibility
  const https = require("https");
  https.get(url, (response) => {
    let data = "";
    response.on("data", (chunk) => { data += chunk; });
    response.on("end", () => {
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.status !== "OK" && jsonData.status !== "ZERO_RESULTS") {
          return res.status(400).json({ ok: false, error: `Google API error: ${jsonData.status} - ${jsonData.error_message || "Unknown error"}` });
        }
        const reviews = (jsonData.result?.reviews || []).map((r) => ({
          author: r.author_name || "",
          rating: r.rating || 5,
          text: r.text || "",
          date: r.time ? new Date(r.time * 1000).toISOString().split("T")[0] : "",
        }));
        res.json({ ok: true, reviews, placeName: jsonData.result?.name || "" });
      } catch (e) {
        console.error("Parse error:", e);
        res.status(500).json({ ok: false, error: "parse_error" });
      }
    });
  }).on("error", (e) => {
    console.error("Google API request error:", e);
    res.status(500).json({ ok: false, error: e.message || "request_failed" });
  });
});

// POST /api/admin/reviews/import/trustpilot
app.post("/api/admin/reviews/import/trustpilot", async (req, res) => {
  try {
    // Trustpilot API requires authentication and is more complex
    // For now, return a message that manual entry is needed
    res.json({ ok: false, error: "Trustpilot import not yet implemented. Please add reviews manually or use Trustpilot API." });
  } catch (error) {
    console.error("Trustpilot reviews import error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== REFERRALS ==================
// GET /api/admin/referrals?status=PENDING|APPROVED|REJECTED
app.get("/api/admin/referrals", (req, res) => {
  try {
    const status = req.query.status;
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    
    let items = list;
    if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
      items = list.filter((x) => x && x.status === status);
    }
    
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ items });
  } catch (error) {
    console.error("Referrals list error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/patient/:patientId/referrals
// Get referrals where this patient is either the inviter OR the invited person
app.get("/api/patient/:patientId/referrals", (req, res) => {
  try {
    const { patientId } = req.params;
    const status = req.query.status;
    
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    
    // Filter: referrals where this patient is the inviter OR the invited person
    let items = list.filter((x) => 
      x && (
        x.inviterPatientId === patientId || 
        x.invitedPatientId === patientId
      )
    );
    
    // Optional status filter
    if (status && (status === "PENDING" || status === "APPROVED" || status === "REJECTED")) {
      items = items.filter((x) => x.status === status);
    }
    
    // Sort by created date (newest first)
    items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    console.log(`[REFERRALS] Patient ${patientId} has ${items.length} referral(s)`);
    items.forEach(item => {
      console.log(`[REFERRALS] Referral ${item.id}: inviter=${item.inviterPatientId}, invited=${item.invitedPatientId}, status=${item.status}, inviterDiscount=${item.inviterDiscountPercent}, invitedDiscount=${item.invitedDiscountPercent}`);
    });
    
    res.json({ ok: true, items });
  } catch (error) {
    console.error("Get patient referrals error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// PATCH /api/admin/referrals/:id/approve
app.patch("/api/admin/referrals/:id/approve", (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    
    const inviterDiscountPercent = body.inviterDiscountPercent != null ? Number(body.inviterDiscountPercent) : null;
    const invitedDiscountPercent = body.invitedDiscountPercent != null ? Number(body.invitedDiscountPercent) : null;
    const discountPercent = body.discountPercent != null ? Number(body.discountPercent) : null;
    
    // Validasyon
    if (inviterDiscountPercent != null && (Number.isNaN(inviterDiscountPercent) || inviterDiscountPercent < 0 || inviterDiscountPercent > 99)) {
      return res.status(400).json({ error: "inviterDiscountPercent must be 0..99" });
    }
    if (invitedDiscountPercent != null && (Number.isNaN(invitedDiscountPercent) || invitedDiscountPercent < 0 || invitedDiscountPercent > 99)) {
      return res.status(400).json({ error: "invitedDiscountPercent must be 0..99" });
    }
    if (discountPercent != null && (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 99)) {
      return res.status(400).json({ error: "discountPercent must be 0..99" });
    }
    
    // En az bir indirim yüzdesi belirtilmeli
    if (inviterDiscountPercent == null && invitedDiscountPercent == null && discountPercent == null) {
      return res.status(400).json({ error: "At least one discount percent must be provided" });
    }
    
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const idx = list.findIndex((x) => x && x.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    if (list[idx].status !== "PENDING") {
      return res.status(409).json({ error: "only PENDING can be approved" });
    }
    
    // Güncelleme
    const updated = {
      ...list[idx],
      status: "APPROVED",
      approvedAt: now(),
    };
    
    // Yeni format varsa onu kullan
    if (inviterDiscountPercent != null || invitedDiscountPercent != null) {
      updated.inviterDiscountPercent = inviterDiscountPercent;
      updated.invitedDiscountPercent = invitedDiscountPercent;
      if (discountPercent != null) {
        updated.discountPercent = discountPercent;
      } else if (inviterDiscountPercent != null && invitedDiscountPercent != null) {
        updated.discountPercent = Math.round((inviterDiscountPercent + invitedDiscountPercent) / 2);
      } else {
        updated.discountPercent = inviterDiscountPercent ?? invitedDiscountPercent;
      }
    } else if (discountPercent != null) {
      updated.discountPercent = discountPercent;
      updated.inviterDiscountPercent = discountPercent;
      updated.invitedDiscountPercent = discountPercent;
    }
    
    list[idx] = updated;
    writeJson(REF_FILE, list);
    
    res.json({ ok: true, item: updated });
  } catch (error) {
    console.error("Referral approve error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// PATCH /api/admin/referrals/:id/reject
app.patch("/api/admin/referrals/:id/reject", (req, res) => {
  try {
    const { id } = req.params;
    const raw = readJson(REF_FILE, []);
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const idx = list.findIndex((x) => x && x.id === id);
    
    if (idx < 0) {
      return res.status(404).json({ error: "not found" });
    }
    
    if (list[idx].status !== "PENDING") {
      return res.status(409).json({ error: "only PENDING can be rejected" });
    }
    
    list[idx] = {
      ...list[idx],
      status: "REJECTED",
      discountPercent: null,
      inviterDiscountPercent: null,
      invitedDiscountPercent: null,
      approvedAt: null,
    };
    
    writeJson(REF_FILE, list);
    res.json({ ok: true, item: list[idx] });
  } catch (error) {
    console.error("Referral reject error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== REFERRAL EVENTS (Model 1: Invitee-based cap) ==================
// ReferralEvent: Payment-based referral system
// earned_discount = invitee_paid_amount * INVITER_RATE
// invitee_discount = invitee_paid_amount * INVITEE_RATE

// Helper: Round to currency (2 decimals)
function roundToCurrency(amount) {
  return Math.round(amount * 100) / 100;
}

// POST /api/referrals/payment-event
// Called when invitee payment is completed (PAID/CAPTURED status)
app.post("/api/referrals/payment-event", (req, res) => {
  try {
    const {
      inviteePatientId,
      inviteePaymentId,
      inviteePaidAmount,
      currency = "USD",
      paymentStatus = "PAID",
    } = req.body || {};
    
    if (!inviteePatientId || !inviteePaymentId || !inviteePaidAmount) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }
    
    const paidAmount = Number(inviteePaidAmount);
    if (isNaN(paidAmount) || paidAmount <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_paid_amount" });
    }
    
    // Only process PAID/CAPTURED payments
    if (paymentStatus !== "PAID" && paymentStatus !== "CAPTURED") {
      return res.status(400).json({ ok: false, error: "payment_not_completed" });
    }
    
    // Find referral relationship (inviter for this invitee)
    const referrals = readJson(REF_FILE, []);
    const referralList = Array.isArray(referrals) ? referrals : Object.values(referrals);
    
    // Find the first valid referral (inviter) for this invitee
    const referral = referralList.find(
      (r) => r.invitedPatientId === inviteePatientId && r.status === "APPROVED"
    );
    
    if (!referral) {
      return res.status(404).json({ ok: false, error: "no_referral_found" });
    }
    
    // Check if event already exists for this payment
    const events = readJson(REF_EVENT_FILE, []);
    const eventList = Array.isArray(events) ? events : Object.values(events);
    
    const existingEvent = eventList.find((e) => e.inviteePaymentId === inviteePaymentId);
    if (existingEvent) {
      return res.status(409).json({ ok: false, error: "event_already_exists" });
    }
    
    // Get clinic config for rates
    const clinic = readJson(CLINIC_FILE, {});
    const inviterRate = (clinic.defaultInviterDiscountPercent || 0) / 100; // Convert % to decimal
    const inviteeRate = (clinic.defaultInvitedDiscountPercent || 0) / 100; // Convert % to decimal
    
    // Calculate earned discount (from invitee's paid amount)
    const earnedDiscountAmount = roundToCurrency(paidAmount * inviterRate);
    
    // Create referral event
    const newEvent = {
      id: rid("refevt"),
      inviterPatientId: referral.inviterPatientId,
      inviteePatientId,
      inviteePaymentId,
      inviteePaidAmount: paidAmount,
      currency,
      inviterRate,
      inviteeRate,
      earnedDiscountAmount,
      status: "EARNED",
      createdAt: now(),
    };
    
    eventList.push(newEvent);
    writeJson(REF_EVENT_FILE, eventList);
    
    // Update inviter's credit (add to patient record)
    const patients = readJson(PAT_FILE, {});
    if (patients[referral.inviterPatientId]) {
      const inviter = patients[referral.inviterPatientId];
      inviter.referralCredit = (inviter.referralCredit || 0) + earnedDiscountAmount;
      inviter.referralCreditUpdatedAt = now();
      writeJson(PAT_FILE, patients);
    }
    
    console.log(`[REFERRAL_EVENT] Created: ${newEvent.id}, Inviter: ${referral.inviterPatientId}, Credit: ${earnedDiscountAmount} ${currency}`);
    
    res.json({ ok: true, event: newEvent });
  } catch (error) {
    console.error("Referral event creation error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/referrals/payment-refund
// Called when invitee payment is refunded/chargeback
app.post("/api/referrals/payment-refund", (req, res) => {
  try {
    const { inviteePaymentId } = req.body || {};
    
    if (!inviteePaymentId) {
      return res.status(400).json({ ok: false, error: "payment_id_required" });
    }
    
    // Find existing event
    const events = readJson(REF_EVENT_FILE, []);
    const eventList = Array.isArray(events) ? events : Object.values(events);
    const eventIdx = eventList.findIndex((e) => e.inviteePaymentId === inviteePaymentId && e.status === "EARNED");
    
    if (eventIdx < 0) {
      return res.status(404).json({ ok: false, error: "event_not_found" });
    }
    
    const event = eventList[eventIdx];
    
    // Reverse the event
    event.status = "REVERSED";
    event.reversedAt = now();
    eventList[eventIdx] = event;
    writeJson(REF_EVENT_FILE, eventList);
    
    // Reverse inviter's credit (subtract from patient record)
    const patients = readJson(PAT_FILE, {});
    if (patients[event.inviterPatientId]) {
      const inviter = patients[event.inviterPatientId];
      inviter.referralCredit = Math.max(0, (inviter.referralCredit || 0) - event.earnedDiscountAmount);
      inviter.referralCreditUpdatedAt = now();
      writeJson(PAT_FILE, patients);
    }
    
    console.log(`[REFERRAL_EVENT] Reversed: ${event.id}, Credit reversed: ${event.earnedDiscountAmount} ${event.currency}`);
    
    res.json({ ok: true, event });
  } catch (error) {
    console.error("Referral event reversal error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/patient/:patientId/referral-credit
// Get inviter's total referral credit
app.get("/api/patient/:patientId/referral-credit", (req, res) => {
  try {
    const { patientId } = req.params;
    const patients = readJson(PAT_FILE, {});
    
    if (!patients[patientId]) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }
    
    const credit = patients[patientId].referralCredit || 0;
    
    res.json({ ok: true, credit, currency: "USD" });
  } catch (error) {
    console.error("Get referral credit error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/referral-events
// Get all referral events (admin view)
app.get("/api/admin/referral-events", (req, res) => {
  try {
    const events = readJson(REF_EVENT_FILE, []);
    const eventList = Array.isArray(events) ? events : Object.values(events);
    
    // Sort by created date (newest first)
    eventList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    res.json({ ok: true, items: eventList });
  } catch (error) {
    console.error("Get referral events error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// WebSocket kodu kaldırıldı (audio call özelliği kaldırıldı)

// ================== ADMIN AUTHENTICATION ==================
// Middleware: Validate admin JWT token
function requireAdminAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify clinic exists and is active
    const clinics = readJson(CLINICS_FILE, {});
    const clinic = clinics[decoded.clinicId];
    if (!clinic || clinic.status !== "ACTIVE") {
      return res.status(401).json({ ok: false, error: "clinic_not_active" });
    }
    
    req.clinicId = decoded.clinicId;
    req.clinicCode = clinic.clinicCode;
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
    return res.status(500).json({ ok: false, error: "auth_error" });
  }
}

// POST /api/admin/login
// Clinic login (clinic code + password)
app.post("/api/admin/login", async (req, res) => {
  try {
    const { clinicCode, password } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (!password || !String(password).trim()) {
      return res.status(400).json({ ok: false, error: "password_required" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
    
    console.log(`[LOGIN] Attempting login for clinic code: "${code}"`);
    
    let clinic = null;
    
    // Try Supabase first (if available)
    if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
      console.log(`[LOGIN] Checking Supabase for clinic "${code}"...`);
      const supabaseClinic = await supabase.getClinicByCode(code);
      if (supabaseClinic) {
        console.log(`[LOGIN] ✅ Found clinic "${code}" in Supabase`);
        // Convert Supabase format to JSON format (snake_case to camelCase)
        clinic = {
          clinicCode: supabaseClinic.clinic_code,
          name: supabaseClinic.name,
          email: supabaseClinic.email,
          password: supabaseClinic.password,
          address: supabaseClinic.address || "",
          phone: supabaseClinic.phone || "",
          website: supabaseClinic.website || "",
          logoUrl: supabaseClinic.logo_url || "",
          googleMapsUrl: supabaseClinic.google_maps_url || "",
          defaultInviterDiscountPercent: supabaseClinic.default_inviter_discount_percent,
          defaultInvitedDiscountPercent: supabaseClinic.default_invited_discount_percent,
          createdAt: supabaseClinic.created_at,
          updatedAt: supabaseClinic.updated_at,
        };
      }
    }
    
    // Fallback to clinics.json (multi-clinic support)
    if (!clinic) {
      console.log(`[LOGIN] CLINICS_FILE path: ${CLINICS_FILE}`);
      console.log(`[LOGIN] CLINICS_FILE exists: ${fs.existsSync(CLINICS_FILE)}`);
      const clinics = readJson(CLINICS_FILE, {});
      console.log(`[LOGIN] clinics.json keys:`, Object.keys(clinics));
      clinic = clinics[code];
      
      // If not found in clinics.json, check clinic.json (backward compatibility)
      if (!clinic) {
        console.log(`[LOGIN] Clinic "${code}" not found in clinics.json, checking clinic.json...`);
        const singleClinic = readJson(CLINIC_FILE, {});
        console.log(`[LOGIN] clinic.json clinicCode:`, singleClinic.clinicCode);
        if (singleClinic.clinicCode && singleClinic.clinicCode.toUpperCase() === code) {
          clinic = singleClinic;
          console.log(`[LOGIN] ✅ Found clinic "${code}" in clinic.json`);
        } else {
          console.log(`[LOGIN] ❌ Clinic "${code}" not found in either file`);
        }
      } else {
        console.log(`[LOGIN] ✅ Found clinic "${code}" in clinics.json`);
      }
    }
    
    // Check if clinic exists
    if (!clinic) {
      const allClinics = readJson(CLINICS_FILE, {});
      console.log(`[LOGIN] ❌ Clinic "${code}" does not exist. Available clinics:`, Object.keys(allClinics));
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
    }
    
    // Check password
    if (!clinic.password) {
      console.log(`[LOGIN] Clinic "${code}" has no password set, using default password`);
      // If no password is set, allow login with default password "admin123" (for initial setup)
      const defaultPassword = "admin123";
      if (password !== defaultPassword) {
        console.log(`[LOGIN] ❌ Password mismatch for clinic "${code}" (no password set, expected default)`);
        return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
      }
      // Set default password hash for first login
      const hashedPassword = await bcrypt.hash(defaultPassword, 10);
      clinic.password = hashedPassword;
      
      // Update in the appropriate file
      if (clinics[code]) {
        clinics[code].password = hashedPassword;
        writeJson(CLINICS_FILE, clinics);
        console.log(`[LOGIN] ✅ Set default password for clinic "${code}" in clinics.json`);
      } else {
        writeJson(CLINIC_FILE, clinic);
        console.log(`[LOGIN] ✅ Set default password for clinic "${code}" in clinic.json`);
      }
    } else {
      // Verify password hash
      console.log(`[LOGIN] Verifying password for clinic "${code}"...`);
      console.log(`[LOGIN] Stored password hash (first 20 chars): ${clinic.password.substring(0, 20)}...`);
      console.log(`[LOGIN] Attempted password (length): ${String(password).trim().length} characters`);
      
      const passwordMatch = await bcrypt.compare(String(password).trim(), clinic.password);
      if (!passwordMatch) {
        console.log(`[LOGIN] ❌ Password mismatch for clinic "${code}"`);
        
        // Try common passwords for debugging
        const commonPasswords = ["admin123", "password", "123456", "admin", "MOON", "moon"];
        for (const commonPwd of commonPasswords) {
          const commonMatch = await bcrypt.compare(commonPwd, clinic.password);
          if (commonMatch) {
            console.log(`[LOGIN] ℹ️ Note: Password "${commonPwd}" would work for this clinic`);
            break;
          }
        }
        
        // Also check if password is plain text (shouldn't happen, but for debugging)
        if (clinic.password === String(password).trim()) {
          console.log(`[LOGIN] ⚠️ WARNING: Password appears to be stored in plain text!`);
        }
        
        return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
      }
      console.log(`[LOGIN] ✅ Password verified for clinic "${code}"`);
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { clinicCode: code, type: "admin" },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    console.log(`[LOGIN] ✅ Login successful for clinic "${code}"`);
    
    res.json({
      ok: true,
      token,
      clinicCode: code,
      clinicName: clinic.name || "Clinic",
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/admin/register
// Register a new clinic
app.post("/api/admin/register", async (req, res) => {
  try {
    console.log("[REGISTER] ========== START REGISTER ==========");
    console.log("[REGISTER] Request body:", { ...req.body, password: "***" });
    
    const { clinicName, clinicCode, email, password } = req.body || {};
    
    console.log("[REGISTER] Extracted values:", {
      clinicName: clinicName ? `"${String(clinicName).trim()}"` : "undefined",
      clinicCode: clinicCode ? `"${String(clinicCode).trim()}"` : "undefined",
      email: email ? `"${String(email).trim()}"` : "undefined",
      password: password ? "***" : "undefined",
    });
    
    if (!clinicName || !String(clinicName).trim()) {
      console.log("[REGISTER] ❌ Clinic name validation failed");
      return res.status(400).json({ ok: false, error: "clinic_name_required" });
    }
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (String(clinicCode).trim().length < 3) {
      return res.status(400).json({ ok: false, error: "clinic_code_too_short" });
    }
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }
    
    if (!password || !String(password).trim()) {
      return res.status(400).json({ ok: false, error: "password_required" });
    }
    
    if (String(password).trim().length < 6) {
      return res.status(400).json({ ok: false, error: "password_too_short" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
    const name = String(clinicName).trim();
    const emailLower = String(email).trim().toLowerCase();
    
    // Check if clinic code already exists - check Supabase first
    let existingClinic = null;
    if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
      console.log(`[REGISTER] Checking Supabase for existing clinic "${code}"...`);
      existingClinic = await supabase.getClinicByCode(code);
      if (existingClinic) {
        console.log(`[REGISTER] ❌ Clinic "${code}" already exists in Supabase`);
        return res.status(409).json({ ok: false, error: "clinic_code_already_exists" });
      }
    }
    
    // Check JSON files for backward compatibility
    const clinic = readJson(CLINIC_FILE, {});
    if (clinic.clinicCode && clinic.clinicCode.toUpperCase() === code) {
      return res.status(409).json({ ok: false, error: "clinic_code_already_exists" });
    }
    
    // Check clinics.json for multi-clinic support
    const clinics = readJson(CLINICS_FILE, {});
    if (clinics[code]) {
      return res.status(409).json({ ok: false, error: "clinic_code_already_exists" });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
    
    // Create new clinic entry
    const newClinic = {
      clinicCode: code,
      name: name, // clinicName'den gelen değer
      email: emailLower,
      password: hashedPassword,
      address: "",
      phone: "",
      website: "",
      logoUrl: "",
      googleMapsUrl: "",
      defaultInviterDiscountPercent: null,
      defaultInvitedDiscountPercent: null,
      createdAt: now(),
      updatedAt: now(),
    };
    
    // Try to save to Supabase first (if available) - Use UPSERT to handle both create and update
    if (supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable()) {
      console.log(`[REGISTER] Attempting to upsert clinic "${code}" to Supabase...`);
      const supabaseClinicData = {
        clinic_code: code.toUpperCase(), // Ensure uppercase
        name: name,
        email: emailLower,
        password: hashedPassword,
        address: "",
        phone: "",
        website: "",
        logo_url: "",
        google_maps_url: "",
        default_inviter_discount_percent: null,
        default_invited_discount_percent: null,
        google_reviews: [],
        trustpilot_reviews: [],
        created_at: now(), // BIGINT (milliseconds)
        updated_at: now(), // BIGINT (milliseconds)
      };
      console.log(`[REGISTER] Upsert payload clinic_code:`, supabaseClinicData.clinic_code);
      const supabaseResult = await supabase.upsertClinic(supabaseClinicData);
      if (supabaseResult) {
        console.log(`[REGISTER] ✅ Upserted clinic "${code}" to Supabase`);
      } else {
        console.warn(`[REGISTER] ⚠️  Failed to upsert clinic "${code}" to Supabase, falling back to file storage`);
      }
    } else {
      console.log(`[REGISTER] Supabase not available, using file-based storage`);
    }
    
    // Always save to clinics.json as fallback (for backward compatibility and local dev)
    clinics[code] = newClinic;
    writeJson(CLINICS_FILE, clinics);
    console.log(`[REGISTER] ✅ Saved clinic "${code}" to clinics.json`);
    console.log(`[REGISTER] CLINICS_FILE path: ${CLINICS_FILE}`);
    console.log(`[REGISTER] CLINICS_FILE exists after write: ${fs.existsSync(CLINICS_FILE)}`);
    console.log(`[REGISTER] clinics.json keys after write:`, Object.keys(clinics));
    
    // Verify the write
    const verifyClinics = readJson(CLINICS_FILE, {});
    if (verifyClinics[code]) {
      console.log(`[REGISTER] ✅ Verified: clinic "${code}" exists in clinics.json after write`);
    } else {
      console.error(`[REGISTER] ❌ ERROR: clinic "${code}" NOT found in clinics.json after write!`);
    }
    
    // Also update clinic.json if it's empty (for backward compatibility)
    if (!clinic.clinicCode) {
      writeJson(CLINIC_FILE, newClinic);
    }
    
    console.log(`[REGISTER] ✅ New clinic registered: ${code} - ${name}`);
    console.log(`[REGISTER] ========== END REGISTER ==========`);
    
    res.json({
      ok: true,
      clinicCode: code,
      clinicName: name,
      message: "Clinic registered successfully",
    });
  } catch (error) {
    console.error("[REGISTER] ❌ Clinic registration error:", error);
    console.log(`[REGISTER] ========== END REGISTER (ERROR) ==========`);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/admin/forgot-password/verify
// Verify clinic code and email for password reset
app.post("/api/admin/forgot-password/verify", (req, res) => {
  try {
    const { clinicCode, email } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
    const emailLower = String(email).trim().toLowerCase();
    
    console.log(`[FORGOT-PASSWORD] Verifying clinic code: "${code}", email: "${emailLower}"`);
    
    // First check clinics.json (multi-clinic support)
    const clinics = readJson(CLINICS_FILE, {});
    let clinic = clinics[code];
    
    // If not found in clinics.json, check clinic.json (backward compatibility)
    if (!clinic) {
      console.log(`[FORGOT-PASSWORD] Clinic "${code}" not found in clinics.json, checking clinic.json...`);
      clinic = readJson(CLINIC_FILE, {});
      if (clinic.clinicCode && clinic.clinicCode.toUpperCase() !== code) {
        clinic = null;
      }
    }
    
    if (!clinic) {
      console.log(`[FORGOT-PASSWORD] ❌ Clinic "${code}" not found`);
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    // Check if email matches
    if (!clinic.email || clinic.email.toLowerCase() !== emailLower) {
      console.log(`[FORGOT-PASSWORD] ❌ Email mismatch for clinic "${code}"`);
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    console.log(`[FORGOT-PASSWORD] ✅ Verification successful for clinic "${code}"`);
    res.json({ ok: true });
  } catch (error) {
    console.error("Forgot password verify error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/admin/forgot-password/reset
// Reset password after verification
app.post("/api/admin/forgot-password/reset", async (req, res) => {
  try {
    const { clinicCode, email, newPassword } = req.body || {};
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }
    
    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }
    
    if (!newPassword || !String(newPassword).trim()) {
      return res.status(400).json({ ok: false, error: "new_password_required" });
    }
    
    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ ok: false, error: "password_too_short" });
    }
    
    const code = String(clinicCode).trim().toUpperCase();
    const emailLower = String(email).trim().toLowerCase();
    
    console.log(`[FORGOT-PASSWORD] Resetting password for clinic code: "${code}", email: "${emailLower}"`);
    
    // First check clinics.json (multi-clinic support)
    const clinics = readJson(CLINICS_FILE, {});
    let clinic = clinics[code];
    let isInClinicsJson = true;
    
    // If not found in clinics.json, check clinic.json (backward compatibility)
    if (!clinic) {
      console.log(`[FORGOT-PASSWORD] Clinic "${code}" not found in clinics.json, checking clinic.json...`);
      clinic = readJson(CLINIC_FILE, {});
      isInClinicsJson = false;
      if (clinic.clinicCode && clinic.clinicCode.toUpperCase() !== code) {
        clinic = null;
      }
    }
    
    if (!clinic) {
      console.log(`[FORGOT-PASSWORD] ❌ Clinic "${code}" not found`);
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    // Check if email matches
    if (!clinic.email || clinic.email.toLowerCase() !== emailLower) {
      console.log(`[FORGOT-PASSWORD] ❌ Email mismatch for clinic "${code}"`);
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_email" });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(String(newPassword).trim(), 10);
    clinic.password = hashedPassword;
    clinic.updatedAt = now();
    
    // Update in the appropriate file
    if (isInClinicsJson) {
      clinics[code].password = hashedPassword;
      clinics[code].updatedAt = now();
      writeJson(CLINICS_FILE, clinics);
      console.log(`[FORGOT-PASSWORD] ✅ Password reset for clinic "${code}" in clinics.json`);
      
      // Verify the write
      const verifyClinics = readJson(CLINICS_FILE, {});
      const verifyClinic = verifyClinics[code];
      if (verifyClinic && verifyClinic.password) {
        const verifyMatch = await bcrypt.compare(String(newPassword).trim(), verifyClinic.password);
        if (verifyMatch) {
          console.log(`[FORGOT-PASSWORD] ✅ Verification successful: New password works for clinic "${code}"`);
        } else {
          console.error(`[FORGOT-PASSWORD] ❌ Verification failed: New password does NOT work for clinic "${code}"`);
        }
      } else {
        console.error(`[FORGOT-PASSWORD] ❌ Verification failed: Clinic "${code}" not found after write`);
      }
    } else {
      clinic.password = hashedPassword;
      clinic.updatedAt = now();
      writeJson(CLINIC_FILE, clinic);
      console.log(`[FORGOT-PASSWORD] ✅ Password reset for clinic "${code}" in clinic.json`);
      
      // Verify the write
      const verifyClinic = readJson(CLINIC_FILE, {});
      if (verifyClinic && verifyClinic.password) {
        const verifyMatch = await bcrypt.compare(String(newPassword).trim(), verifyClinic.password);
        if (verifyMatch) {
          console.log(`[FORGOT-PASSWORD] ✅ Verification successful: New password works for clinic "${code}"`);
        } else {
          console.error(`[FORGOT-PASSWORD] ❌ Verification failed: New password does NOT work for clinic "${code}"`);
        }
      } else {
        console.error(`[FORGOT-PASSWORD] ❌ Verification failed: Clinic "${code}" not found after write`);
      }
    }
    
    console.log(`[FORGOT-PASSWORD] ✅ Password reset successful for clinic "${code}"`);
    res.json({ ok: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Forgot password reset error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/admin/me
// Get current clinic info (requires auth)
app.get("/api/admin/me", requireAdminAuth, (req, res) => {
  try {
    const clinics = readJson(CLINICS_FILE, {});
    const clinic = clinics[req.clinicId];
    
    if (!clinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }
    
    // Don't send password
    const { password, ...clinicInfo } = clinic;
    
    res.json({ ok: true, clinic: clinicInfo });
  } catch (error) {
    console.error("Get admin me error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== ANALYTICS ==================
// Test endpoint to verify analytics routes are loaded
app.get("/api/events/test", (req, res) => {
  res.json({ ok: true, message: "Analytics routes are loaded", timestamp: now() });
});

// GET /api/events/download
// Download analytics events as JSONL file (admin only - requires auth)
app.get("/api/events/download", requireAdminAuth, (req, res) => {
  console.log("[ANALYTICS] GET /api/events/download - Request received");
  try {
    if (!fs.existsSync(EVENTS_FILE)) {
      console.log("[ANALYTICS] Events file not found:", EVENTS_FILE);
      return res.status(404).json({ ok: false, error: "events_file_not_found" });
    }
    console.log("[ANALYTICS] Events file found, size:", fs.statSync(EVENTS_FILE).size);
    
    const stats = fs.statSync(EVENTS_FILE);
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Content-Disposition", `attachment; filename="events_${Date.now()}.jsonl"`);
    res.setHeader("Content-Length", stats.size);
    
    const fileStream = fs.createReadStream(EVENTS_FILE);
    fileStream.pipe(res);
  } catch (error) {
    console.error("[ANALYTICS] Download error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// GET /api/events/stats
// Get analytics stats (admin only - requires auth)
app.get("/api/events/stats", requireAdminAuth, (req, res) => {
  try {
    if (!fs.existsSync(EVENTS_FILE)) {
      return res.json({ ok: true, total_events: 0, file_size: 0, file_path: EVENTS_FILE });
    }
    
    const stats = fs.statSync(EVENTS_FILE);
    const fileContent = fs.readFileSync(EVENTS_FILE, "utf8");
    const lines = fileContent.trim().split("\n").filter(line => line.trim());
    
    // Count events by type
    const eventCounts = {};
    lines.forEach(line => {
      try {
        const event = JSON.parse(line);
        const eventName = event.event_name || "unknown";
        eventCounts[eventName] = (eventCounts[eventName] || 0) + 1;
      } catch {
        // Skip invalid JSON lines
      }
    });
    
    res.json({
      ok: true,
      total_events: lines.length,
      file_size: stats.size,
      file_path: EVENTS_FILE,
      event_counts: eventCounts,
      last_modified: stats.mtime,
    });
  } catch (error) {
    console.error("[ANALYTICS] Stats error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// POST /api/events
// Accept analytics events from clients
app.post("/api/events", (req, res) => {
  try {
    const event = req.body;
    
    // Validate required fields
    if (!event.event_name || typeof event.event_name !== "string") {
      return res.status(400).json({ ok: false, error: "event_name_required" });
    }
    
    if (!event.ts_ms || typeof event.ts_ms !== "number") {
      return res.status(400).json({ ok: false, error: "ts_ms_required" });
    }
    
    if (!event.app || typeof event.app !== "object") {
      return res.status(400).json({ ok: false, error: "app_required" });
    }
    
    if (!event.app.platform || typeof event.app.platform !== "string") {
      return res.status(400).json({ ok: false, error: "app.platform_required" });
    }
    
    if (!event.app.session_id || typeof event.app.session_id !== "string") {
      return res.status(400).json({ ok: false, error: "app.session_id_required" });
    }
    
    if (!event.props || typeof event.props !== "object") {
      return res.status(400).json({ ok: false, error: "props_required" });
    }
    
    // Reject forbidden keys in props (PII and sensitive content)
    const forbiddenKeys = ["phone", "email", "name", "message_text", "xray", "photo_content", "password", "token"];
    const propsKeys = Object.keys(event.props);
    const foundForbidden = propsKeys.find(key => forbiddenKeys.includes(key.toLowerCase()));
    if (foundForbidden) {
      console.warn(`[ANALYTICS] Rejected event "${event.event_name}" - forbidden key in props: ${foundForbidden}`);
      return res.status(400).json({ ok: false, error: "forbidden_key_in_props", key: foundForbidden });
    }
    
    // Ensure event_version defaults to 1
    if (!event.event_version) {
      event.event_version = 1;
    }
    
    // Add server timestamp
    event.server_ts_ms = now();
    
    // Append to JSONL file (one JSON object per line)
    const jsonLine = JSON.stringify(event) + "\n";
    try {
      fs.appendFileSync(EVENTS_FILE, jsonLine, "utf8");
    } catch (fileError) {
      // On Render, filesystem may be ephemeral - log but don't fail
      console.warn(`[ANALYTICS] Failed to write event to file (ephemeral filesystem?): ${fileError.message}`);
      // Still return success - in production we'd use a database
    }
    
    // Return success
    res.json({ ok: true, event_id: event.event_name + "_" + event.ts_ms });
  } catch (error) {
    console.error("[ANALYTICS] Event processing error:", error);
    res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
});

// ================== START ==================
// Log Supabase status on startup
const supabaseStatus = supabase && supabase.isSupabaseAvailable && supabase.isSupabaseAvailable();
console.log(`[INIT] ========== SUPABASE STATUS ==========`);
console.log(`[INIT] Supabase module loaded: ${supabase !== null}`);
console.log(`[INIT] Supabase available: ${supabaseStatus}`);
if (supabaseStatus) {
  console.log(`[INIT] ✅ Supabase is ENABLED - clinics will be stored in Supabase`);
} else {
  console.log(`[INIT] ⚠️  Supabase is DISABLED - using file-based storage`);
  console.log(`[INIT] To enable Supabase, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables`);
}
console.log(`[INIT] =====================================`);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running: http://127.0.0.1:${PORT}`);
  console.log(`✅ Health:        http://127.0.0.1:${PORT}/health`);
  console.log(`✅ Admin:         http://127.0.0.1:${PORT}/admin.html`);
});
