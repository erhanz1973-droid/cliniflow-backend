console.log("### CLINIFLOW SERVER BOOT ###", new Date().toISOString());

// Load environment variables from .env file (for local development)
try {
  require("dotenv").config();
} catch (e) {
  // dotenv not installed, that's okay - use environment variables directly
}

// ================= SERVER STARTUP ================= */
console.log("[INIT] Server starting up");
console.log("[INIT] Node version:", process.version);
console.log("[INIT] Environment:", process.env.NODE_ENV || "development");
console.log("[INIT] Working directory:", __dirname);

const express = require('express');
const path = require('path');

const app = express();
// Prevent 304 Not Modified responses for dynamic APIs (Render/CF caching + ETag).
// We explicitly disable ETag generation globally; admin endpoints are always dynamic.
app.set("etag", false);

// Static middleware will serve admin.html from public/

// admin-dashboard.html route - serve admin dashboard (MUST be before static middleware)
app.get("/admin-dashboard.html", (req, res) => {
  try {
    console.log("[ROUTE] /admin-dashboard.html requested - serving admin dashboard");
    const filePath = path.join(__dirname, "public/admin-dashboard.html");
    
    // Add cache-busting headers
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    
    res.sendFile(filePath);
  } catch (error) {
    console.error("[ROUTE] Error serving admin-dashboard.html:", error);
    res.status(500).send("Internal server error");
  }
});

const cors = require("cors");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

// Admin authentication middleware
const { verifyAdminToken, adminAuth } = require('./admin-auth-middleware.js');
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for logo uploads (base64)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer configuration for general file uploads (legacy, kept for compatibility)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // İzin verilen dosya tipleri
    const allowedMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'video/mp4', 'video/quicktime',
      'application/dicom', 'application/x-dicom', 'image/dicom',
      'application/zip', 'application/x-rar-compressed', 'application/vnd.rar', 'application/x-rar',
    ];

    const forbiddenExtensions = [
      '.exe', '.app', '.deb', '.rpm', '.msi', '.dmg', '.pkg',
      '.bat', '.cmd', '.com', '.scr', '.vbs', '.ps1',
      '.js', '.jsx', '.ts', '.tsx', '.py', '.pyc', '.pyo',
      '.sh', '.bash', '.zsh', '.csh', '.fish',
      '.php', '.asp', '.aspx', '.jsp', '.rb', '.pl', '.pm',
      '.7z', '.tar', '.gz', '.bz2',
      '.dll', '.so', '.dylib', '.sys', '.drv',
    ];

    const fileExt = path.extname(file.originalname || '').toLowerCase();
    const mimeType = file.mimetype || '';

    if (forbiddenExtensions.includes(fileExt)) {
      console.error(`[Upload] Forbidden file extension: ${fileExt}`);
      return cb(new Error(`Dosya tipi yasak: ${fileExt}. Güvenlik nedeniyle bu dosya tipi yüklenemez.`));
    }

    if (!allowedMimeTypes.includes(mimeType)) {
      if (fileExt === '.dcm' || fileExt === '.dicom') {
        console.log(`[Upload] Allowing DICOM file with extension ${fileExt} and MIME type ${mimeType}`);
        return cb(null, true);
      }
      console.error(`[Upload] Unallowed MIME type: ${mimeType} for file ${file.originalname}`);
      return cb(new Error(`Dosya tipi desteklenmiyor: ${mimeType}. İzin verilen tipler: JPG, PNG, HEIC, PDF, DOCX, MP4, ZIP, RAR, DICOM`));
    }

    console.log(`[Upload] File type approved: ${mimeType} (${fileExt})`);
    cb(null, true);
  }
});

// Multer configuration for CHAT file uploads (STRICT - medical chat only)
const chatUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max for PDF, 10MB for images (validated in endpoint)
  },
  fileFilter: (req, file, cb) => {
    // CHAT ALLOWED FILE TYPES (STRICT)
    const allowedMimeTypes = [
      // Images (max 10 MB)
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      // Medical Images (treated as images)
      // Dental x-ray, panoramic x-ray, intraoral photos - all use jpeg/png
      // Documents (max 15 MB)
      'application/pdf',
      // Optional: .docx (only if size < limit)
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/zip', // .zip
      'application/x-zip-compressed', // .zip (alternative MIME type)
    ];

    // CHAT DISALLOWED FILE TYPES
    const forbiddenExtensions = [
      // Video files
      '.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm',
      // Audio files
      '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac',
      // Executable files
      '.exe', '.app', '.deb', '.rpm', '.msi', '.dmg', '.pkg',
      '.bat', '.cmd', '.com', '.scr', '.vbs', '.ps1',
      // Scripts
      '.js', '.jsx', '.ts', '.tsx', '.py', '.pyc', '.pyo',
      '.sh', '.bash', '.zsh', '.csh', '.fish',
      '.php', '.asp', '.aspx', '.jsp', '.rb', '.pl', '.pm',
      // Compressed files (zip allowed, others not)
      '.rar', '.7z', '.tar', '.gz', '.bz2',
      // Spreadsheet files
      '.xls', '.xlsx', '.csv',
      // System files
      '.dll', '.so', '.dylib', '.sys', '.drv',
    ];

    const fileExt = path.extname(file.originalname || '').toLowerCase();
    const mimeType = file.mimetype || '';

    // Check forbidden extensions FIRST (security)
    if (forbiddenExtensions.includes(fileExt)) {
      console.error(`[Chat Upload] Forbidden file extension: ${fileExt}`);
      return cb(new Error(`INVALID_FILE_TYPE: Dosya tipi yasak: ${fileExt}`));
    }

    // Check allowed MIME types
    if (!allowedMimeTypes.includes(mimeType)) {
      console.error(`[Chat Upload] Unallowed MIME type: ${mimeType} for file ${file.originalname}`);
      return cb(new Error(`INVALID_FILE_TYPE: Dosya tipi desteklenmiyor: ${mimeType}. İzin verilen tipler: JPG, PNG, HEIC, PDF, DOCX, ZIP`));
    }

    // Verify MIME type matches extension
    const mimeToExt = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/jpg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
    };

    const expectedExts = mimeToExt[mimeType];
    if (expectedExts && !expectedExts.includes(fileExt)) {
      console.error(`[Chat Upload] MIME type/extension mismatch: ${mimeType} vs ${fileExt}`);
      return cb(new Error(`INVALID_FILE_TYPE: Dosya uzantısı ve MIME tipi uyuşmuyor: ${fileExt} / ${mimeType}`));
    }

    console.log(`[Chat Upload] File type approved: ${mimeType} (${fileExt})`);
    cb(null, true);
  }
});

const PORT = process.env.PORT || 5050;

/* ================= SUPABASE CLIENT ================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "patient-files"; // Default: patient-files

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY environment variables gerekli!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log("✅ Supabase client initialized");

/* ================= SUPABASE HELPERS ================= */
function isMissingColumnError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  // PostgREST missing column codes commonly show as 42703
  return code === "42703" || msg.toLowerCase().includes("does not exist");
}

function getMissingColumnFromError(error) {
  const msg = String(error?.message || "");
  // Example: 'column referrals.invited_patient_name does not exist'
  const m = msg.match(/column\s+referrals\.([a-zA-Z0-9_]+)\s+does\s+not\s+exist/i);
  return m?.[1] || null;
}

function getMissingColumnFromErrorForTable(tableName, error) {
  const table = String(tableName || "").trim();
  const msg = String(error?.message || "");
  if (!table) return null;

  // Pattern 1: column <table>.<col> does not exist
  const re1 = new RegExp(`column\\s+${table}\\.([a-zA-Z0-9_]+)\\s+does\\s+not\\s+exist`, "i");
  const m1 = msg.match(re1);
  if (m1?.[1]) return m1[1];

  // Pattern 2: Could not find the 'col' column of '<table>' in the schema cache
  // (PostgREST / Supabase schema cache error style)
  const re2 = new RegExp(`Could not find the '([^']+)' column of '${table}'`, "i");
  const m2 = msg.match(re2);
  if (m2?.[1]) return m2[1];

  return null;
}

async function insertWithColumnPruning(tableName, payload) {
  const table = String(tableName || "").trim();
  let current = { ...(payload || {}) };
  let lastError = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from(table).insert(current).select().single();
    if (!error) return { data, error: null };

    lastError = error;
    if (!isMissingColumnError(error)) return { data: null, error };

    const missing = getMissingColumnFromErrorForTable(table, error);
    if (!missing || !(missing in current)) return { data: null, error };

    console.warn(`[${table}] Missing column on insert, pruning:`, missing);
    delete current[missing];
  }

  return { data: null, error: lastError || new Error("insert_failed") };
}

async function insertReferralWithColumnPruning(payload) {
  let current = { ...(payload || {}) };
  let lastError = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase.from("referrals").insert(current).select().single();
    if (!error) return { data, error: null };

    lastError = error;
    if (!isMissingColumnError(error)) return { data: null, error };

    const missing = getMissingColumnFromError(error);
    if (!missing || !(missing in current)) return { data: null, error };

    console.warn("[REFERRALS] Missing column on insert, pruning:", missing);
    delete current[missing];
  }

  return { data: null, error: lastError || new Error("referral_insert_failed") };
}

/* ================= JWT SECRET ================= */
const JWT_SECRET = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "cliniflow-secret-key-change-in-production";

/* ================= PATHS ================= */
const DATA_DIR = path.join(__dirname, "data");
const PATIENTS_DIR = path.join(DATA_DIR, "patients");
const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
const TRAVEL_DIR = path.join(DATA_DIR, "travel");

const PUBLIC_DIR = path.join(__dirname, "public");

/* ================= HELPER FUNCTIONS ================= */

// Hasta isminden patient ID oluştur
async function generatePatientIdFromName(patientName) {
  if (!patientName || !String(patientName).trim()) {
    // İsim yoksa fallback: random kod
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
  
  // Türkçe karakterleri dönüştür
  const turkishMap = {
    'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I',
    'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U'
  };
  
  let normalized = patientName
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (match) => turkishMap[match])
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  
  // İsim kelimelerini al
  const words = normalized.split(' ');
  let slug = '';
  
  // Her kelimeden ilk harf al
  for (const word of words) {
    if (word.length > 0) {
      slug += word[0].toUpperCase();
    }
  }
  
  // Eğer slug boşsa veya 1 karakter ise, ilk kelimenin ilk 3 harfini al
  if (slug.length < 2) {
    slug = normalized.substring(0, 3).toUpperCase();
  }
  
  // Slug'ı 3 karakterle sınırla
  slug = slug.substring(0, 3);
  
  // Rastgele 2 haneli sayı ekle
  const randomNum = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const finalId = slug + randomNum;
  
  // Aynı ID varsa sonuna sayı ekle
  let counter = 1;
  let attempts = 0;
  let finalIdWithCounter = finalId;
  
  while (attempts < 10) {
    const { count, error: checkError } = await supabase
      .from('patients')
      .select('patient_id', { count: 'exact', head: true })
      .eq('patient_id', finalIdWithCounter);
    
    if (checkError) {
      console.warn("[REGISTER] Error checking patient ID uniqueness:", checkError);
      break;
    }
    
    if (count === 0) {
      return finalIdWithCounter;
    }
    
    // Aynı ID varsa sonuna sayı ekle
    counter++;
    finalIdWithCounter = `${slug}_${counter}`;
    attempts++;
  }
  
  // Fallback: timestamp ekle
  return `${slug}_${Date.now().toString().slice(-6)}`;
}

// Referral code oluştur
function generateReferralCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

app.get("/admin-travel.html", (req, res) => {
  try {
    console.log("[ROUTE] /admin-travel.html requested");
    const filePath = path.join(PUBLIC_DIR, "admin-travel.html");
    console.log("[ROUTE] Looking for file at:", filePath);
    console.log("[ROUTE] PUBLIC_DIR:", PUBLIC_DIR);
    console.log("[ROUTE] __dirname:", __dirname);
    
    if (!fs.existsSync(filePath)) {
      console.error("[ROUTE] File not found:", filePath);
      return res.status(404).send(`
        <html>
          <head><title>Admin Travel - Not Found</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>Admin Travel Sayfası Bulunamadı</h1>
            <p>admin-travel.html dosyası bulunamadı.</p>
            <p>File path: ${filePath}</p>
            <p>PUBLIC_DIR: ${PUBLIC_DIR}</p>
            <p>__dirname: ${__dirname}</p>
          </body>
        </html>
      `);
    }
    console.log("[ROUTE] File found, sending:", filePath);
    const absolutePath = path.resolve(filePath);
    console.log("[ROUTE] Absolute path:", absolutePath);
    res.sendFile(absolutePath);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ROUTE] Error serving admin-travel.html:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.get("/admin-patients.html", (req, res) => {
  try {
    const filePath = path.join(PUBLIC_DIR, "admin-patients.html");
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`
        <html>
          <head><title>Admin Patients - Not Found</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>Admin Patients Sayfası Bulunamadı</h1>
            <p>admin-patients.html dosyası bulunamadı.</p>
          </body>
        </html>
      `);
    }
    res.sendFile(path.resolve(filePath));
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ROUTE] Error serving admin-patients.html:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.get("/admin-treatment-create.html", (req, res) => {
  try {
    const filePath = path.join(PUBLIC_DIR, "admin-treatment-create.html");
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`
        <html>
          <head><title>404 - Admin Treatment Create Bulunamadı</title></head>
          <body>
            <h1>Admin Treatment Create Sayfası Bulunamadı</h1>
            <p>admin-treatment-create.html dosyası bulunamadı.</p>
            <p>File path: ${filePath}</p>
            <p>PUBLIC_DIR: ${PUBLIC_DIR}</p>
            <p>__dirname: ${__dirname}</p>
          </body>
        </html>
      `);
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error("[ROUTE] Error serving admin-treatment-create.html:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/admin-treatment.html", (req, res) => {
  try {
    const filePath = path.join(PUBLIC_DIR, "admin-treatment.html");
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`
        <html>
          <head><title>Admin Treatment Sayfası Bulunamadı</title></head>
          <body>
            <h1>Admin Treatment Sayfası Bulunamadı</h1>
            <p>admin-treatment.html dosyası bulunamadı.</p>
            <p>File path: ${filePath}</p>
            <p>PUBLIC_DIR: ${PUBLIC_DIR}</p>
            <p>__dirname: ${__dirname}</p>
          </body>
        </html>
      `);
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error("[ROUTE] Error serving admin-treatment.html:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/admin-register.html", (req, res) => {
  try {
    const filePath = path.join(PUBLIC_DIR, "admin-register.html");
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`
        <html>
          <head><title>Admin Register - Not Found</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>Admin Register Sayfası Bulunamadı</h1>
            <p>admin-register.html dosyası bulunamadı.</p>
          </body>
        </html>
      `);
    }
    res.sendFile(path.resolve(filePath));
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ROUTE] Error serving admin-register.html:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.get("/admin-referrals.html", (req, res) => {
  try {
    const filePath = path.join(PUBLIC_DIR, "admin-referrals.html");
    if (!fs.existsSync(filePath)) {
      return res.status(404).send(`
        <html>
          <head><title>Admin Referrals - Not Found</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>Admin Referrals Sayfası Bulunamadı</h1>
            <p>admin-referrals.html dosyası bulunamadı.</p>
          </body>
        </html>
      `);
    }
    res.sendFile(path.resolve(filePath));
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ROUTE] Error serving admin-referrals.html:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

/* ================= HELPERS ================= */
function ensureDirs() {
  [DATA_DIR, PATIENTS_DIR, TREATMENTS_DIR, TRAVEL_DIR, PUBLIC_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function now() {
  return Date.now();
}

/* ================= PATIENT LIST ================= */
function listPatientsFromFiles() {
  ensureDirs();
  const files = fs.readdirSync(PATIENTS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => safeReadJson(path.join(PATIENTS_DIR, f), null))
    .filter(Boolean)
    .map((p) => ({ id: String(p.id || "").trim(), name: p.name || p.id }))
    .filter((p) => p.id);
}

/* ================= ADMIN PAGES ================= */
// admin.html route'u yukarıda tanımlandı (static serving'den önce)


/* ================= PATIENTS ================= */
app.get("/api/patients", (req, res) => {
  res.json({ ok: true, patients: listPatientsFromFiles() });
});

/* ================= TREATMENTS (GET) ================= */
app.get("/api/patient/:patientId/treatments", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  try {
    // Check if admin or patient token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const actorHeader = req.headers["x-actor"];
    const actor = actorHeader ? String(actorHeader).toLowerCase().trim() : "patient";
    const authToken = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!authToken) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authToken, JWT_SECRET);
    } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    // Admin token check: if actor header is "admin" OR token has clinicCode/clinicId but NO patientId
    const hasPatientId = decoded.patientId !== null && decoded.patientId !== undefined && String(decoded.patientId).trim() !== "";
    const hasClinicCode = decoded.clinicCode !== null && decoded.clinicCode !== undefined;
    const hasClinicId = decoded.clinicId !== null && decoded.clinicId !== undefined;
    
    const isAdmin = actor === "admin" || (hasClinicCode && hasClinicId && !hasPatientId);
    
    let clinicId;
    let patientUuid;

    if (isAdmin) {
      // Admin token - verify admin has access to this clinic
      if (!decoded.clinicId || !decoded.clinicCode) {
        return res.status(401).json({ ok: false, error: "invalid_admin_token" });
      }
      clinicId = decoded.clinicId;

      // Find patient UUID by patient_id
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("id, status, clinic_id")
        .eq("patient_id", patientId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (patientError || !patientData) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      // Admin can access any patient in their clinic (even if not approved)
      patientUuid = patientData.id;
    } else {
      // Patient token - verify patient ID matches and status is APPROVED
      if (!decoded.patientId) {
        return res.status(401).json({ ok: false, error: "invalid_token", message: "Token missing patientId" });
      }
      
      clinicId = decoded.clinicId;
      const requestPatientId = decoded.patientId;

      if (requestPatientId !== patientId) {
        return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
      }

      // Check patient status - must be APPROVED
      const statusCheck = await checkPatientApproved(patientId, clinicId);
      if (!statusCheck.approved) {
        if (statusCheck.error === "patient_not_found") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(403).json({ 
          ok: false, 
          error: "patient_not_approved",
          message: "Patient status is not APPROVED. Please wait for clinic approval.",
          status: statusCheck.status || "PENDING"
        });
      }

      patientUuid = statusCheck.patient.id;
    }

    // 2. patient_treatments tablosundan treatments_data'yı çek
    const { data: treatmentsData, error: treatmentsError } = await supabase
      .from("patient_treatments")
      .select("treatments_data, updated_at")
      .eq("patient_id", patientUuid)
      .single();

    if (treatmentsError || !treatmentsData) {
      console.log("Treatments GET - No treatments record found, returning fallback");
      // Fallback: Boş treatments data döndür
      const fallback = {
        schemaVersion: 1,
        updatedAt: now(),
        patientId,
        teeth: [],
      };
      return res.json(fallback);
    }

    // 3. JSONB'den gelen data'yı parse et ve patientId ekle
    const treatmentsJson = treatmentsData.treatments_data || {};
    const result = {
      ...treatmentsJson,
      schemaVersion: treatmentsJson.schemaVersion || 1,
      updatedAt: treatmentsData.updated_at ? new Date(treatmentsData.updated_at).getTime() : now(),
      patientId,
      // Eksik alanları fallback ile tamamla
      teeth: Array.isArray(treatmentsJson.teeth) ? treatmentsJson.teeth : [],
    };

    res.json(result);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Treatments GET error:", error);
    res.status(500).json({ ok: false, error: "treatments_fetch_failed", details: error.message });
  }
});

/* ================= TREATMENTS (POST / PUT) ================= */
app.post("/api/patient/:patientId/treatments", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  const body = req.body || {};
  const { toothId, procedure } = body;

  if (!toothId || !procedure) {
    return res.status(400).json({ ok: false, error: "toothId and procedure are required" });
  }

  try {
    // Check if admin or patient token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const actorHeader = req.headers["x-actor"];
    const actor = actorHeader ? String(actorHeader).toLowerCase().trim() : "patient";
    const authToken = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!authToken) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authToken, JWT_SECRET);
    } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    // Admin token check: if actor header is "admin" OR token has clinicCode/clinicId but NO patientId
    // Simplified check: admin token has clinicCode/clinicId but NO patientId
    const decodedPatientId = decoded.patientId;
    const decodedClinicCode = decoded.clinicCode;
    const decodedClinicId = decoded.clinicId;
    
    const hasPatientId = decodedPatientId !== null && decodedPatientId !== undefined && String(decodedPatientId || "").trim() !== "";
    const hasClinicCode = decodedClinicCode !== null && decodedClinicCode !== undefined;
    const hasClinicId = decodedClinicId !== null && decodedClinicId !== undefined;
    
    // Check if actor header is "admin" (case-insensitive and trimmed)
    const isAdminByActor = String(actor || "").toLowerCase().trim() === "admin";
    // Check if token is admin token (has clinicCode/clinicId but NO patientId)
    const isAdminByToken = hasClinicCode && hasClinicId && !hasPatientId;
    const isAdmin = isAdminByActor || isAdminByToken;
    
    console.log("[TREATMENTS POST] Auth check:", {
      actor,
      actorHeader,
      actorType: typeof actorHeader,
      isAdminByActor,
      isAdminByToken,
      hasPatientId,
      hasClinicCode,
      hasClinicId,
      isAdmin,
      decodedPatientId: decodedPatientId,
      decodedClinicCode: decodedClinicCode,
      decodedClinicId: decodedClinicId,
      patientId: patientId,
    });
    
    let clinicId;
    let patientUuid;

    if (isAdmin) {
      // Admin token - verify admin has access to this clinic
      if (!decodedClinicId || !decodedClinicCode) {
        console.error("[TREATMENTS POST] Invalid admin token: missing clinicId or clinicCode");
        return res.status(401).json({ ok: false, error: "invalid_admin_token" });
      }
      clinicId = decodedClinicId;

      console.log("[TREATMENTS POST] Looking up patient:", { 
        patientId, 
        clinicId, 
        patientIdType: typeof patientId,
        clinicIdType: typeof clinicId,
        patientIdTrimmed: String(patientId || "").trim(),
        clinicIdTrimmed: String(clinicId || "").trim()
      });

      // First, try to find patient by patient_id and clinic_id
      let { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("id, status, clinic_id, name, name")
        .eq("patient_id", String(patientId).trim())
        .eq("clinic_id", String(clinicId).trim())
        .maybeSingle();

      // If not found, try without clinic_id filter (for debugging)
      if (patientError || !patientData) {
        console.log("[TREATMENTS POST] Patient not found with clinic_id filter. Trying without clinic_id filter...");
        const { data: allPatients, error: allError } = await supabase
          .from("patients")
          .select("id, status, clinic_id, name, name")
          .eq("patient_id", String(patientId).trim());
        
        console.log("[TREATMENTS POST] All patients with patient_id:", {
          patientId: String(patientId).trim(),
          foundCount: allPatients?.length || 0,
          patients: allPatients?.map(p => ({
            id: p.id,
            patient_id: p.name,
            clinic_id: p.clinic_id,
            name: p.name
          })) || [],
          error: allError
        });

        if (allPatients && allPatients.length > 0) {
          const matchingClinic = allPatients.find(p => String(p.clinic_id).trim() === String(clinicId).trim());
          if (matchingClinic) {
            console.log("[TREATMENTS POST] Found patient in different clinic. Using it anyway:", matchingClinic);
            patientData = matchingClinic;
            patientError = null;
          } else {
            console.error("[TREATMENTS POST] Patient found but clinic_id mismatch:", {
              requestedClinicId: clinicId,
              foundClinicIds: allPatients.map(p => p.clinic_id)
            });
          }
        }
      }

      if (patientError || !patientData) {
        console.error("[TREATMENTS POST] Patient not found after all attempts:", { 
          patientId: String(patientId).trim(), 
          clinicId: String(clinicId).trim(), 
          error: patientError,
          errorCode: patientError?.code,
          errorMessage: patientError?.message,
          errorDetails: patientError?.details,
          errorHint: patientError?.hint
        });
        return res.status(404).json({ 
          ok: false, 
          error: "patient_not_found",
          details: {
            patientId: String(patientId).trim(),
            clinicId: String(clinicId).trim(),
            error: patientError?.message || "Patient not found"
          }
        });
      }

      // Admin can access any patient in their clinic (even if not approved)
      patientUuid = patientData.id;
      console.log("[TREATMENTS POST] Admin access granted:", { 
        patientId, 
        patientUuid, 
        clinicId,
        patientName: patientData.name,
        patientStatus: patientData.status
      });
    } else {
      // Patient token - verify patient ID matches and status is APPROVED
      if (!decodedPatientId) {
        console.error("[TREATMENTS POST] Patient token missing patientId, but isAdmin is false. This should not happen.");
        return res.status(401).json({ ok: false, error: "invalid_token", message: "Token missing patientId and not admin token" });
      }
      
      clinicId = decodedClinicId;
      const requestPatientId = decodedPatientId;

      if (requestPatientId !== patientId) {
        console.error("[TREATMENTS POST] Patient ID mismatch:", { requestPatientId, patientId, isAdmin });
        return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
      }

      // Check patient status - must be APPROVED
      const statusCheck = await checkPatientApproved(patientId, clinicId);
      if (!statusCheck.approved) {
        if (statusCheck.error === "patient_not_found") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(403).json({ 
          ok: false, 
          error: "patient_not_approved",
          message: "Patient status is not APPROVED. Please wait for clinic approval.",
          status: statusCheck.status || "PENDING"
        });
      }

      patientUuid = statusCheck.patient.id;
    }

    // 2. Mevcut treatments_data'yı çek (varsa)
    const { data: existingTreatments, error: fetchError } = await supabase
      .from("patient_treatments")
      .select("treatments_data")
      .eq("patient_id", patientUuid)
      .single();

    const currentData = existingTreatments?.treatments_data || {
      schemaVersion: 1,
      updatedAt: now(),
      patientId,
      teeth: [],
    };

    // 3. Mevcut teeth array'ini al
    const teeth = Array.isArray(currentData.teeth) ? [...currentData.teeth] : [];

    // 4. Yeni procedure'ı ekle (unique ID ile)
    const newProcedure = {
      id: `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...procedure,
      createdAt: procedure.createdAt || Date.now(),
    };

    // 5. Tooth'u bul veya oluştur
    let toothFound = false;
    const updatedTeeth = teeth.map((tooth) => {
      if (tooth.toothId === toothId) {
        toothFound = true;
        return {
          ...tooth,
          procedures: [...(tooth.procedures || []), newProcedure],
        };
      }
      return tooth;
    });

    // 6. Eğer tooth bulunamadıysa, yeni tooth ekle
    if (!toothFound) {
      updatedTeeth.push({
        toothId,
        procedures: [newProcedure],
      });
    }

    // 7. Güncellenmiş data
    const updatedData = {
      ...currentData,
      updatedAt: Date.now(),
      patientId,
      teeth: updatedTeeth,
      schemaVersion: currentData.schemaVersion || 1,
    };

    // 8. Supabase'e kaydet (UPSERT)
    const treatmentsDataToSave = {
      patient_id: patientUuid,
      treatments_data: updatedData,
      updated_at: new Date().toISOString(),
    };

    const { data: savedData, error: saveError } = await supabase
      .from("patient_treatments")
      .upsert(treatmentsDataToSave, {
        onConflict: "patient_id",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Treatments POST - Supabase error:", saveError);
      return res.status(500).json({ ok: false, error: "treatments_save_failed", details: saveError.message });
    }

    console.log("Treatments POST - Success:", {
      patientId,
      toothId,
      procedureType: procedure.type,
    });

    res.json({ ok: true, saved: true, treatments: updatedData });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Treatments POST - Exception:", error);
    res.status(500).json({ ok: false, error: "treatments_save_exception", details: error.message });
  }
});

/* ================= TREATMENTS DELETE ================= */
app.delete("/api/patient/:patientId/treatments/:procedureId", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  const procedureId = String(req.params.procedureId || "").trim();
  
  if (!patientId || !procedureId) {
    return res.status(400).json({ ok: false, error: "patient_id and procedure_id are required" });
  }

  try {
    // Check if admin or patient token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const actorHeader = req.headers["x-actor"];
    const actor = actorHeader ? String(actorHeader).toLowerCase().trim() : "patient";
    const authToken = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!authToken) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authToken, JWT_SECRET);
    } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    // Admin token check: if actor header is "admin" OR token has clinicCode/clinicId but NO patientId
    const hasPatientId = decoded.patientId !== null && decoded.patientId !== undefined && String(decoded.patientId).trim() !== "";
    const hasClinicCode = decoded.clinicCode !== null && decoded.clinicCode !== undefined;
    const hasClinicId = decoded.clinicId !== null && decoded.clinicId !== undefined;
    
    const isAdmin = actor === "admin" || (hasClinicCode && hasClinicId && !hasPatientId);
    
    let clinicId;
    let patientUuid;

    if (isAdmin) {
      // Admin token - verify admin has access to this clinic
      if (!decoded.clinicId || !decoded.clinicCode) {
        return res.status(401).json({ ok: false, error: "invalid_admin_token" });
      }
      clinicId = decoded.clinicId;

      // Find patient UUID by patient_id
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("id, status, clinic_id")
        .eq("patient_id", patientId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (patientError || !patientData) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      // Admin can access any patient in their clinic (even if not approved)
      patientUuid = patientData.id;
    } else {
      // Patient token - verify patient ID matches and status is APPROVED
      if (!decoded.patientId) {
        return res.status(401).json({ ok: false, error: "invalid_token", message: "Token missing patientId" });
      }
      
      clinicId = decoded.clinicId;
      const requestPatientId = decoded.patientId;

      if (requestPatientId !== patientId) {
        return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
      }

      // Check patient status - must be APPROVED
      const statusCheck = await checkPatientApproved(patientId, clinicId);
      if (!statusCheck.approved) {
        if (statusCheck.error === "patient_not_found") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(403).json({ 
          ok: false, 
          error: "patient_not_approved",
          message: "Patient status is not APPROVED. Please wait for clinic approval.",
          status: statusCheck.status || "PENDING"
        });
      }

      patientUuid = statusCheck.patient.id;
    }

    // 2. Mevcut treatments_data'yı çek
    const { data: existingTreatments, error: fetchError } = await supabase
      .from("patient_treatments")
      .select("treatments_data")
      .eq("patient_id", patientUuid)
      .single();

    if (fetchError || !existingTreatments) {
      return res.status(404).json({ ok: false, error: "treatments_not_found" });
    }

    const currentData = existingTreatments.treatments_data || { teeth: [] };
    const teeth = Array.isArray(currentData.teeth) ? [...currentData.teeth] : [];

    // 3. Procedure'ı bul ve sil
    let procedureFound = false;
    const updatedTeeth = teeth
      .map((tooth) => {
        if (Array.isArray(tooth.procedures)) {
          const filteredProcedures = tooth.procedures.filter((proc) => proc.id !== procedureId);
          if (filteredProcedures.length !== tooth.procedures.length) {
            procedureFound = true;
            return {
              ...tooth,
              procedures: filteredProcedures,
            };
          }
        }
        return tooth;
      })
      .filter((tooth) => {
        // Eğer tooth'un hiç procedure'ı kalmadıysa, tooth'u da silme (opsiyonel, isterseniz silebilirsiniz)
        return Array.isArray(tooth.procedures) ? tooth.procedures.length > 0 : true;
      });

    if (!procedureFound) {
      return res.status(404).json({ ok: false, error: "procedure_not_found" });
    }

    // 4. Güncellenmiş data
    const updatedData = {
      ...currentData,
      updatedAt: Date.now(),
      patientId,
      teeth: updatedTeeth,
      schemaVersion: currentData.schemaVersion || 1,
    };

    // 5. Supabase'e kaydet
    const treatmentsDataToSave = {
      patient_id: patientUuid,
      treatments_data: updatedData,
      updated_at: new Date().toISOString(),
    };

    const { data: savedData, error: saveError } = await supabase
      .from("patient_treatments")
      .upsert(treatmentsDataToSave, {
        onConflict: "patient_id",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Treatments DELETE - Supabase error:", saveError);
      return res.status(500).json({ ok: false, error: "treatments_delete_failed", details: saveError.message });
    }

    console.log("Treatments DELETE - Success:", {
      patientId,
      procedureId,
    });

    res.json({ ok: true, deleted: true, treatments: updatedData });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Treatments DELETE - Exception:", error);
    res.status(500).json({ ok: false, error: "treatments_delete_exception", details: error.message });
  }
});

/* ================= TRAVEL (GET) ================= */
app.get("/api/patient/:patientId/travel", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  try {
    console.log("Travel GET - Request:", { patientId, headers: req.headers });
    
    // Check if admin or patient token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const actorHeader = req.headers["x-actor"];
    const actor = actorHeader ? String(actorHeader).toLowerCase().trim() : "patient";
    const authToken = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    console.log("Travel GET - Auth check:", { 
      hasAuthHeader: !!authHeader, 
      hasTokenHeader: !!tokenHeader, 
      actorHeader,
      actor,
      hasAuthToken: !!authToken 
    });

    if (!authToken) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(authToken, JWT_SECRET);
      console.log("Travel GET - Decoded token:", { 
        hasPatientId: !!decoded.patientId, 
        hasClinicId: !!decoded.clinicId, 
        hasClinicCode: !!decoded.clinicCode,
        clinicId: decoded.clinicId,
        clinicCode: decoded.clinicCode,
        patientId: decoded.patientId
      });
    } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
      console.error("Travel GET - Token verification failed:", error.message);
      return res.status(401).json({ ok: false, error: "invalid_token", details: error.message });
    }

    // Admin token check: if actor header is "admin" OR token has clinicCode/clinicId but NO patientId
    // patientId check: property must exist and have a non-empty string value
    const decodedPatientId = decoded.patientId;
    const hasPatientId = decodedPatientId !== null && 
                         decodedPatientId !== undefined && 
                         decodedPatientId !== "" && 
                         String(decodedPatientId).trim() !== "";
    const hasClinicCode = decoded.clinicCode !== null && decoded.clinicCode !== undefined;
    const hasClinicId = decoded.clinicId !== null && decoded.clinicId !== undefined;
    
    // Admin check: explicit actor header OR (has clinic info AND no patientId)
    const isAdminByActor = actor === "admin";
    const isAdminByToken = hasClinicCode && hasClinicId && !hasPatientId;
    const isAdmin = isAdminByActor || isAdminByToken;
    
    console.log("Travel GET - Admin check:", { 
      actor, 
      actorHeader: actorHeader,
      decodedPatientId,
      hasPatientId, 
      hasClinicCode, 
      hasClinicId,
      clinicId: decoded.clinicId,
      clinicCode: decoded.clinicCode,
      isAdminByActor,
      isAdminByToken,
      isAdmin 
    });
    
    let clinicId;
    let patientUuid;

    if (isAdmin) {
      // Admin token - verify admin has access to this clinic
      if (!decoded.clinicId || !decoded.clinicCode) {
        console.error("Travel GET - Invalid admin token: missing clinicId or clinicCode");
        return res.status(401).json({ ok: false, error: "invalid_admin_token", message: "Admin token missing clinicId or clinicCode" });
      }
      clinicId = decoded.clinicId;

      console.log("Travel GET - Finding patient:", { patientId, clinicId });
      
      // Find patient UUID by patient_id
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .select("id, status, clinic_id, name, name")
        .eq("patient_id", patientId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      console.log("Travel GET - Patient query result:", { 
        hasData: !!patientData, 
        hasError: !!patientError,
        error: patientError,
        patientData: patientData ? { id: patientData.id, patient_id: patientData.name, name: patientData.name, status: patientData.status } : null
      });

      if (patientError) {
        console.error("Travel GET - Patient query error:", patientError);
        return res.status(500).json({ ok: false, error: "database_error", details: patientError.message });
      }
      
      if (!patientData) {
        console.error("Travel GET - Patient not found:", { patientId, clinicId });
        return res.status(404).json({ ok: false, error: "patient_not_found", patientId, clinicId });
      }

      // Admin can access any patient in their clinic (even if not approved)
      patientUuid = patientData.id;
    } else {
      // Patient token - verify patient ID matches and status is APPROVED
      if (!decoded.patientId) {
        return res.status(401).json({ ok: false, error: "invalid_token", message: "Token missing patientId" });
      }
      
      clinicId = decoded.clinicId;
      const requestPatientId = decoded.patientId;

      // Verify patient ID matches token
      if (requestPatientId !== patientId) {
        return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
      }

      // Check patient status - must be APPROVED
      const statusCheck = await checkPatientApproved(patientId, clinicId);
      if (!statusCheck.approved) {
        if (statusCheck.error === "patient_not_found") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(403).json({ 
          ok: false, 
          error: "patient_not_approved",
          message: "Patient status is not APPROVED. Please wait for clinic approval.",
          status: statusCheck.status || "PENDING"
        });
      }

      patientUuid = statusCheck.patient.id;
    }
    console.log("Travel GET - Found patient:", { patientId, patientUuid });

    // 2. patient_travel tablosundan travel_data'yı çek
    const { data: travelData, error: travelError } = await supabase
      .from("patient_travel")
      .select("travel_data, schema_version, updated_at")
      .eq("patient_id", patientUuid)
      .maybeSingle(); // .single() yerine .maybeSingle() kullan - kayıt yoksa null döner, hata vermez

    console.log("Travel GET - Query result:", {
      patientUuid,
      hasData: !!travelData,
      hasError: !!travelError,
      error: travelError,
    });

    if (travelError) {
      console.error("Travel GET - Supabase query error:", travelError);
      // Fallback: Boş travel data döndür
  const fallback = {
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
    editMode: "PATIENT",
    lockedByAdmin: false,
  };
      return res.json(fallback);
    }

    if (!travelData) {
      console.log("Travel GET - No travel record found for patientUuid:", patientUuid, "patientId:", patientId);
      // Fallback: Boş travel data döndür
  const fallback = {
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
    editMode: "PATIENT",
    lockedByAdmin: false,
  };
      return res.json(fallback);
    }

    // 3. JSONB'den gelen data'yı parse et ve patientId ekle
    const travelJson = travelData.travel_data || {};
    
    console.log("Travel GET - travelJson (full):", JSON.stringify(travelJson, null, 2));
    console.log("Travel GET - travelJson.flights (raw):", JSON.stringify(travelJson.flights, null, 2));
    
    // Hotel bilgisini debug et ve validate et
    let hotelData = travelJson.hotel;
    
    // Null check
    if (hotelData === null) {
      console.log("Travel GET - Hotel is null");
      hotelData = null;
    } else if (hotelData === undefined) {
      console.log("Travel GET - Hotel is undefined, setting to null");
      hotelData = null;
    } else if (typeof hotelData === "string") {
      // Legacy format: hotel is a string
      const hotelName = String(hotelData).trim();
      hotelData = hotelName ? { name: hotelName } : null;
      console.log("Travel GET - Hotel was string, converted to:", JSON.stringify(hotelData, null, 2));
    } else if (typeof hotelData === "object") {
      // Modern format: hotel is an object
      const hotelName = String(hotelData?.name || "").trim();
      if (hotelName) {
        hotelData = {
          name: hotelName,
          address: hotelData?.address ? String(hotelData.address).trim() : undefined,
          checkIn: hotelData?.checkIn ? String(hotelData.checkIn).trim() : undefined,
          checkOut: hotelData?.checkOut ? String(hotelData.checkOut).trim() : undefined,
          googleMapsUrl: hotelData?.googleMapsUrl ? String(hotelData.googleMapsUrl).trim() : undefined,
        };
        console.log("Travel GET - Hotel object validated, name:", hotelName);
      } else {
        console.log("Travel GET - Hotel object exists but name is empty, setting to null");
        hotelData = null;
      }
    } else {
      console.log("Travel GET - Hotel has unexpected type:", typeof hotelData, "setting to null");
      hotelData = null;
    }
    
    console.log("Travel GET - travelJson.hotel (raw from DB):", JSON.stringify(travelJson.hotel, null, 2));
    console.log("Travel GET - Processed hotelData:", JSON.stringify(hotelData, null, 2));
    
    // Result objesini oluştururken hotel'i açıkça set et
    // Flights bilgisini validate et
    const flightsArray = Array.isArray(travelJson.flights) ? travelJson.flights : [];
    console.log("Travel GET - Processed flights array:", JSON.stringify(flightsArray, null, 2));
    console.log("Travel GET - Flights count:", flightsArray.length);
    
    // Result objesini oluştururken travelJson'dan sadece gerekli alanları al, hotel'i ayrı set et
    const result = {
      schemaVersion: travelData.schema_version || travelJson.schemaVersion || 1,
      updatedAt: travelData.updated_at ? new Date(travelData.updated_at).getTime() : (travelJson.updatedAt || now()),
      patientId: patientId,
      // Hotel bilgisini validate edilmiş haliyle kullan - null veya object olabilir, undefined değil
      hotel: hotelData, // hotelData zaten null veya object olarak validate edildi
      flights: flightsArray, // Flights array'i validate edildi
      notes: travelJson.notes || "",
      airportPickup: travelJson.airportPickup || null,
      editPolicy: travelJson.editPolicy || {
        hotel: "ADMIN",
        flights: "ADMIN",
        notes: "ADMIN",
      },
      editMode: travelJson.editMode || "PATIENT",
      lockedByAdmin: travelJson.lockedByAdmin || false,
    };

    console.log("Travel GET - Final result object:", JSON.stringify(result, null, 2));
    console.log("Travel GET - Final result.hotel:", JSON.stringify(result.hotel, null, 2));
    console.log("Travel GET - Final result.flights:", JSON.stringify(result.flights, null, 2));
    res.json(result);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Travel GET error:", error);
    res.status(500).json({ ok: false, error: "travel_fetch_failed", details: error.message });
  }
});

/* ================= TRAVEL (POST / PUT) ================= */
async function saveTravel(req, res) {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  const body = req.body || {};
  const actor = String(req.headers["x-actor"] || "patient").toLowerCase();
  const authHeader = req.headers.authorization;
  const isAdminHeader = actor === "admin" || authHeader?.startsWith("Bearer ");
  
  let isAdmin = false;
  let adminClinicId = null;
  let adminClinicCode = null;

  // Admin token doğrulaması
  if (isAdminHeader) {
    try {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ ok: false, error: "missing_token" });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      
      if (!decoded.clinicId || !decoded.clinicCode) {
        return res.status(401).json({ ok: false, error: "invalid_token_format" });
      }
      
      isAdmin = true;
      adminClinicId = decoded.clinicId;
      adminClinicCode = decoded.clinicCode;
      console.log("[TRAVEL SAVE] Admin token verified:", { clinicId: adminClinicId, clinicCode: adminClinicCode });
    } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
      console.error("[TRAVEL SAVE] Admin token verification failed:", error.message);
      return res.status(401).json({ ok: false, error: "invalid_token", details: error.message });
    }
  }

  try {
    // If patient (not admin), check token and approval status
    if (!isAdmin) {
      // Get token from Authorization header or x-patient-token
      const authHeader = req.headers.authorization;
      const tokenHeader = req.headers["x-patient-token"];
      const token = authHeader?.startsWith("Bearer ") 
        ? authHeader.substring(7) 
        : tokenHeader;

      if (!token) {
        return res.status(401).json({ ok: false, error: "missing_token" });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }

      const clinicId = decoded.clinicId;
      const requestPatientId = decoded.patientId;

      // Verify patient ID matches token
      if (requestPatientId !== patientId) {
        return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
      }

      // Check patient status - must be APPROVED
      const statusCheck = await checkPatientApproved(patientId, clinicId);
      if (!statusCheck.approved) {
        if (statusCheck.error === "patient_not_found") {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }
        return res.status(403).json({ 
          ok: false, 
          error: "patient_not_approved",
          message: "Patient status is not APPROVED. Please wait for clinic approval.",
          status: statusCheck.status || "PENDING"
        });
      }
    }

    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    let query = supabase
      .from("patients")
      .select("id, clinic_id")
      .eq("patient_id", patientId);
    
    // Admin ise sadece kendi clinic'ine ait patient'ları görebilir
    if (isAdmin && adminClinicId) {
      query = query.eq("clinic_id", adminClinicId);
    }
    
    const { data: patientData, error: patientError } = await query.single();

    if (patientError || !patientData) {
      console.error("Travel SAVE - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }
    
    // Admin ise patient'ın clinic_id'sini kontrol et
    if (isAdmin && adminClinicId && patientData.clinic_id !== adminClinicId) {
      console.error("Travel SAVE - Admin cannot access patient from other clinic");
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    const patientUuid = patientData.id;

    // 2. Mevcut travel_data'yı çek (varsa)
    const { data: existingTravel, error: fetchError } = await supabase
      .from("patient_travel")
      .select("travel_data, schema_version")
      .eq("patient_id", patientUuid)
      .single();

    const current = existingTravel?.travel_data || {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    hotel: null, // hotel: { name, checkIn, checkOut, googleMapsUrl, address }
    flights: [],
    notes: "",
      airportPickup: null,
      editPolicy: {
        hotel: "ADMIN",
        flights: "ADMIN",
        notes: "ADMIN",
      },
    editMode: "PATIENT",
    lockedByAdmin: false,
    };

  // 🔒 Admin kilitlediyse hasta yazamasın
  if (current.lockedByAdmin && !isAdmin) {
    return res.status(403).json({
      ok: false,
      error: "travel_locked_by_admin",
    });
  }

    // 🧠 MERGE-SAFE - Tüm alanları birleştir
    console.log("Travel SAVE - Body:", JSON.stringify(body, null, 2));
    console.log("Travel SAVE - Body hotel:", JSON.stringify(body.hotel, null, 2));
    console.log("Travel SAVE - Current hotel:", JSON.stringify(current.hotel, null, 2));
    
    // Hotel bilgisini merge et - body'den gelen hotel bilgisini kullan, yoksa current'tan al
    let mergedHotel = current.hotel;
    if (body.hotel !== undefined) {
      // body.hotel null ise, null yap
      if (body.hotel === null) {
        mergedHotel = null;
      } else if (typeof body.hotel === "object" && body.hotel !== null) {
        // body.hotel object ise, name varsa kullan
        if (body.hotel.name && String(body.hotel.name).trim() !== "") {
          mergedHotel = {
            name: String(body.hotel.name).trim(),
            address: body.hotel.address ? String(body.hotel.address).trim() : undefined,
            checkIn: body.hotel.checkIn ? String(body.hotel.checkIn).trim() : undefined,
            checkOut: body.hotel.checkOut ? String(body.hotel.checkOut).trim() : undefined,
            googleMapsUrl: body.hotel.googleMapsUrl ? String(body.hotel.googleMapsUrl).trim() : undefined,
          };
        } else {
          // name yoksa null yap
          mergedHotel = null;
        }
      }
    }
    
  const next = {
      schemaVersion: body.schemaVersion || current.schemaVersion || 1,
    updatedAt: now(),
      patientId,
      // Hotel - merge edilmiş hotel bilgisini kullan
      hotel: mergedHotel,
      // Flights - array gelirse güncelle
      flights: Array.isArray(body.flights) ? body.flights : (current.flights || []),
      // Notes
      notes: typeof body.notes === "string" ? body.notes : (current.notes || ""),
      // Airport Pickup - önemli!
      airportPickup: body.airportPickup !== undefined ? body.airportPickup : current.airportPickup,
      // Edit Policy
      editPolicy: body.editPolicy || current.editPolicy || {
        hotel: "ADMIN",
        flights: "ADMIN",
        notes: "ADMIN",
      },
      // Edit Mode
      editMode: body.editMode || current.editMode || "PATIENT",
      // Locked by Admin
      lockedByAdmin: body.lockedByAdmin !== undefined ? !!body.lockedByAdmin : (current.lockedByAdmin || false),
    };
    
    console.log("Travel SAVE - Next hotel (before save):", JSON.stringify(next.hotel, null, 2));
    console.log("Travel SAVE - Next object (full):", JSON.stringify(next, null, 2));

    // 3. Supabase'e kaydet (UPSERT)
    const travelDataToSave = {
      patient_id: patientUuid,
      travel_data: next,
      schema_version: next.schemaVersion || 1,
      updated_at: new Date().toISOString(),
    };

    console.log("Travel SAVE - Attempting to save:", {
      patientId,
      patientUuid,
      hasHotel: !!next.hotel,
      hotelData: JSON.stringify(next.hotel, null, 2),
      hasAirportPickup: !!next.airportPickup,
    });

    const { data: savedData, error: saveError } = await supabase
      .from("patient_travel")
      .upsert(travelDataToSave, {
        onConflict: "patient_id",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Travel SAVE - Supabase error:", saveError);
      return res.status(500).json({ ok: false, error: "travel_save_failed", details: saveError.message });
    }

    if (!savedData) {
      console.error("Travel SAVE - No data returned from Supabase upsert");
      return res.status(500).json({ ok: false, error: "travel_save_failed", details: "No data returned" });
    }

    // Supabase'den dönen veriyi kontrol et - bu gerçekte kaydedilen veri
    const savedTravelData = savedData.travel_data || {};
    console.log("Travel SAVE - Saved travel_data from Supabase:", JSON.stringify(savedTravelData, null, 2));
    console.log("Travel SAVE - Saved travel_data.hotel:", JSON.stringify(savedTravelData.hotel, null, 2));
    
    // Supabase'den dönen veriyi kullan (gerçekte kaydedilen)
    const finalTravelData = savedTravelData.hotel !== undefined ? savedTravelData : next;
    
    console.log("Travel SAVE - Success:", {
      patientId,
      patientUuid,
      savedPatientUuid: savedData.name,
      hasHotel: !!finalTravelData.hotel,
      hotelData: JSON.stringify(finalTravelData.hotel, null, 2),
      hasAirportPickup: !!finalTravelData.airportPickup,
      airportPickupData: finalTravelData.airportPickup,
    });

    res.json({ ok: true, saved: true, travel: finalTravelData });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Travel SAVE - Exception:", error);
    res.status(500).json({ ok: false, error: "travel_save_exception", details: error.message });
  }
}

app.post("/api/patient/:patientId/travel", saveTravel);
app.put("/api/patient/:patientId/travel", saveTravel);

/* ================= ADMIN TRAVEL LOCK ================= */
app.post("/api/admin/patient/:patientId/travel-lock", adminAuth, (req, res) => {
  ensureDirs();
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false });

  const filePath = path.join(TRAVEL_DIR, `${patientId}.json`);
  const json = safeReadJson(filePath, {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    hotel: null,
    flights: [],
    notes: "",
    editMode: "PATIENT",
    lockedByAdmin: false,
  });

  json.lockedByAdmin = !!req.body.lockedByAdmin;
  json.editMode = json.lockedByAdmin ? "ADMIN" : "PATIENT";
  json.updatedAt = now();

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), "utf-8");
  res.json({ ok: true, travel: json });
});

/* ================= AUTH MIDDLEWARE ================= */
function userAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[AUTH] Missing or invalid Authorization header");
    return res.status(401).json({ ok: false, error: "missing_token" });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { userId: decoded.userId };
    req.clinicId = decoded.clinicId;
    req.clinicCode = decoded.clinicCode;
    next();
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[AUTH] Token verification failed:", error.message);
    return res.status(401).json({ ok: false, error: "invalid_token", details: error.message });
  }
}

/* ================= PATIENT STATUS CHECK HELPER ================= */
// Patient status kontrolü - APPROVED olmalı
async function checkPatientApproved(patientId, clinicId) {
  try {
    const { data: patient, error } = await supabase
      .from("patients")
      .select("id, name, status, clinic_id")
      .eq("patient_id", String(patientId))
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (error || !patient) {
      console.error("[CHECK STATUS] Patient not found:", error);
      return { approved: false, error: "patient_not_found" };
    }

    if (patient.status !== "APPROVED" && patient.status !== "ACTIVE") {
      console.log(`[CHECK STATUS] Patient ${patientId} status is ${patient.status}, not APPROVED or ACTIVE`);
      return { approved: false, error: "patient_not_approved", status: patient.status };
    }

    return { approved: true, patient };
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[CHECK STATUS] Error checking patient status:", error);
    return { approved: false, error: "status_check_failed", details: error.message };
  }
}

/* ================= ADMIN REGISTER ================= */
app.post("/api/admin/register", async (req, res) => {
  try {
    console.log("[REGISTER] Full request body:", JSON.stringify({ ...req.body, password: "***" }));
    const { clinicName, clinicCode, email, password, clinicType: requestClinicType } = req.body || {};
    console.log("[REGISTER] Extracted clinicType from request:", requestClinicType);
    console.log("[REGISTER] clinicType type:", typeof requestClinicType);
    console.log("[REGISTER] clinicType value:", requestClinicType);

    if (!clinicName || !String(clinicName).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_name_required" });
    }

    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }

    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }

    if (!password || !String(password).trim()) {
      return res.status(400).json({ ok: false, error: "password_required" });
    }

    const trimmedClinicCode = String(clinicCode).trim().toUpperCase();
    const trimmedEmail = String(email).trim().toLowerCase();

    // Klinik kodu zaten var mı kontrol et
    const { data: existingClinic } = await supabase
      .from("clinics")
      .select("id")
      .eq("clinic_code", trimmedClinicCode)
      .single();

    if (existingClinic) {
      return res.status(400).json({ ok: false, error: "clinic_code_already_exists" });
    }

    // Email zaten var mı kontrol et
    const { data: existingEmail } = await supabase
      .from("clinics")
      .select("id")
      .eq("email", trimmedEmail)
      .single();

    if (existingEmail) {
      return res.status(400).json({ ok: false, error: "email_already_exists" });
    }

    // Şifreyi hash'le
    const passwordHash = await bcrypt.hash(String(password).trim(), 10);

    // Clinic type and modules (default: DENTAL with standard modules)
    console.log("[REGISTER] Before processing - requestClinicType:", requestClinicType);
    console.log("[REGISTER] requestClinicType is undefined?", requestClinicType === undefined);
    console.log("[REGISTER] requestClinicType is null?", requestClinicType === null);
    
    // Clinic type: Only DENTAL supported
    const clinicType = String(requestClinicType || "DENTAL").trim().toUpperCase();
    const finalClinicType = clinicType === "DENTAL" ? "DENTAL" : "DENTAL"; // Always DENTAL
    
    console.log("[REGISTER] Final clinicType:", finalClinicType);
    
    // Default enabled modules for DENTAL clinics
    const defaultModules = ["UPLOADS", "TRAVEL", "REFERRALS", "CHAT", "PATIENTS", "DENTAL_TREATMENTS", "DENTAL_TEETH_CHART"];
    
    console.log("[REGISTER] Default modules for", finalClinicType, ":", defaultModules);
    
    // Use provided modules or default
    const enabledModules = Array.isArray(req.body.enabledModules) 
      ? req.body.enabledModules 
      : defaultModules;
    
    console.log("[REGISTER] Final enabled modules:", enabledModules);

    // Plan and patient limits (default: FREE plan with 3 patients)
    const plan = String(req.body.plan || "FREE").trim().toUpperCase();
    const validPlans = ["FREE", "BASIC", "PRO"];
    const finalPlan = validPlans.includes(plan) ? plan : "FREE";
    
    // Set maxPatients based on plan
    // Free: 3, Basic: 10, Pro: unlimited (null)
    const maxPatients = finalPlan === "FREE" ? 3 : (finalPlan === "BASIC" ? 10 : null);
    
    // Branding: Only Pro plan can customize (Free and Basic show standard Clinicator branding)
    const branding = {
      title: finalPlan === "PRO" ? String(clinicName).trim() : "",
      logoUrl: finalPlan === "PRO" ? "" : "",
      showPoweredBy: finalPlan !== "PRO", // Free and Basic show "Powered by Clinicator"
    };
    
    console.log("[REGISTER] Plan:", finalPlan, "maxPatients:", maxPatients, "branding:", branding);

    // Klinik oluştur
    const insertData = {
      clinic_code: trimmedClinicCode,
      name: String(clinicName).trim(),
      email: trimmedEmail,
      password_hash: passwordHash,
      address: "",
      phone: "",
      website: "",
      logo_url: "",
      google_maps_url: "",
      default_inviter_discount_percent: null,
      default_invited_discount_percent: null,
      clinic_type: finalClinicType,
      enabled_modules: enabledModules,
      plan: finalPlan,
      max_patients: maxPatients,
      branding: branding,
    };
    
    console.log("[REGISTER] Inserting clinic with data:", {
      clinic_code: insertData.clinic_code,
      name: insertData.name,
      email: insertData.email,
      clinic_type: insertData.clinic_type,
      enabled_modules: insertData.enabled_modules,
      password_hash: "***",
    });
    
    const { data: newClinic, error } = await insertWithColumnPruning("clinics", insertData);

    if (error) {
      console.error("[REGISTER] Supabase insert error:", error);
      console.error("[REGISTER] Error code:", error.code);
      console.error("[REGISTER] Error message:", error.message);
      console.error("[REGISTER] Error details:", error.details);
      console.error("[REGISTER] Attempted to insert clinic_type:", finalClinicType);
      console.error("[REGISTER] Attempted to insert enabled_modules:", enabledModules);
      
      // Daha spesifik hata mesajları
      if (error.code === "23505") { // Unique violation
        return res.status(400).json({ 
          ok: false, 
          error: "clinic_code_or_email_already_exists",
          message: "Clinic code or email already registered"
        });
      }
      
      return res.status(500).json({ 
        ok: false, 
        error: "registration_failed", 
        message: insertError.message || "Unknown database error",
        details: {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        }
      });
    }

    // Verify the inserted clinic type
    console.log("[REGISTER] Successfully created clinic:", {
      clinicCode: newClinic.clinic_code,
      clinicType: newClinic.clinic_type,
      enabledModules: newClinic.enabled_modules,
    });
    
    // JWT token oluştur
    const token = jwt.sign(
      { clinicId: newClinic.id, clinicCode: trimmedClinicCode },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      ok: true,
      token,
      clinicCode: trimmedClinicCode,
      clinicName: newClinic.name,
      clinicType: newClinic.clinic_type,
      enabledModules: newClinic.enabled_modules,
      message: "Clinic registered successfully",
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Register error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN RECENT TREATMENTS ================= */
app.get("/api/admin/recent-treatments", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }

    // Get recent treatments with patient and doctor info
    const { data: treatments, error } = await supabase
      .from("treatments")
      .select(`
        *,
        patient:patient_id(name, full_name),
        doctor:doctor_id(name, full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[RECENT TREATMENTS] Error:", error);
      return res.status(500).json({ ok: false, error: "failed_to_fetch" });
    }

    res.json(treatments || []);

  } catch (err) {
    console.error("[RECENT TREATMENTS] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN STATS ================= */
app.get("/api/admin/stats", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }

    // Get current month and year
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate monthly patients
    const { data: monthlyPatients, error: patientsError } = await supabase
      .from("patients")
      .select("*")
      .eq("status", "APPROVED")
      .gte("created_at", new Date(currentYear, currentMonth, 1).toISOString())
      .lt("created_at", new Date(currentYear, currentMonth + 1, 1).toISOString());

    // Calculate monthly treatments
    const { data: monthlyTreatments, error: treatmentsError } = await supabase
      .from("treatments")
      .select("*")
      .gte("created_at", new Date(currentYear, currentMonth, 1).toISOString())
      .lt("created_at", new Date(currentYear, currentMonth + 1, 1).toISOString());

    // Get last 6 months data
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const month = new Date(currentYear, currentMonth - i, 1);
      const monthName = month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();

      const { data: monthPatients } = await supabase
        .from("patients")
        .select("*")
        .eq("status", "APPROVED")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      const { data: monthTreatments } = await supabase
        .from("treatments")
        .select("*")
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      monthlyData.push({
        month: monthName,
        patients: monthPatients?.length || 0,
        treatments: monthTreatments?.length || 0
      });
    }

    res.json({
      ok: true,
      monthlyPatients: monthlyPatients?.length || 0,
      monthlyTreatments: monthlyTreatments?.length || 0,
      monthlyData
    });

  } catch (err) {
    console.error("[ADMIN STATS] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password, clinicCode } = req.body || {};

    if (!email || !String(email).trim()) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }

    if (!password || !String(password).trim()) {
      return res.status(400).json({ ok: false, error: "password_required" });
    }

    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }

    const trimmedEmail = String(email).trim().toLowerCase();
    const trimmedPassword = String(password).trim();
    const trimmedClinicCode = String(clinicCode).trim().toUpperCase();

    // 🔥 PRODUCTION: Use Supabase clinics table ONLY - NO FILE SYSTEM
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("*")
      .eq("clinic_code", trimmedClinicCode)
      .single();

    if (clinicError || !clinic) {
      console.error("[ADMIN LOGIN] Clinic not found:", clinicError);
      return res.status(401).json({ ok: false, error: "invalid_clinic_credentials" });
    }

    // Validate clinic email and password
    if (clinic.email !== trimmedEmail) {
      return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
    }

    // Simple password validation (in production, use bcrypt)
    if (clinic.password_hash !== trimmedPassword) {
      return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
    }

    // JWT token oluştur
    const token = jwt.sign(
      {
        adminId: clinic.id,
        role: "ADMIN",
        clinicId: clinic.id,
        clinicCode: trimmedClinicCode
      },
      process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      ok: true,
      token,
      admin: {
        email: clinic.email,
        clinicCode: clinic.clinic_code,
        name: clinic.name
      }
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN LOGIN] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= PATIENT LOGIN ================= */
app.post("/api/patient/login", async (req, res) => {
  try {
    const { phone } = req.body || {};

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required", message: "Phone number is required" });
    }

    const trimmedPhone = String(phone).trim();

    // Hasta bul (telefon numarası ile)
    const { data: patient, error } = await supabase
      .from("patients")
      .select("id, name, name, phone, status, clinic_id, clinic_code, role")
      .eq("phone", trimmedPhone)
      .maybeSingle();

    if (error) {
      console.error("[PATIENT LOGIN] Database error:", error);
      return res.status(500).json({ ok: false, error: "internal_error", message: "Database error occurred" });
    }

    if (!patient) {
      return res.status(404).json({ 
        ok: false, 
        error: "patient_not_found", 
        message: "No patient found with this phone number. Please register first." 
      });
    }

    // Klinik bilgilerini al
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, clinic_code, name")
      .eq("id", patient.clinic_id)
      .single();

    if (!clinic?.data) {
      console.error("[PATIENT LOGIN] Clinic lookup error:", clinicError);
      return res.status(500).json({ ok: false, error: "internal_error", message: "Clinic lookup failed" });
    }

    // JWT token oluştur (register endpoint ile aynı format)
    const token = jwt.sign(
      { 
        patientId: patient.name, 
        clinicId: patient.clinic_id,
        clinicCode: clinic.clinic_code || patient.clinic_code || "",
        role: patient.role || "PATIENT",
        roleType: patient.role || "PATIENT",
        status: patient.status || "PENDING"
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      ok: true,
      token,
      patientId: patient.name,
      name: patient.name || "",
      phone: patient.phone || "",
      status: patient.status || "PENDING",
      role: patient.role || "PATIENT",
      clinicCode: clinic.clinic_code || "",
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[PATIENT LOGIN] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error", message: error.message });
  }
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const { data: clinics, error } = await supabase
      .from("clinics")
      .select("clinic_code, name")
      .limit(1);
    
    // Test patients table schema
    const { data: testPatient, error: patientError } = await supabase
      .from("patients")
      .select("license_number, department, specialties, full_name, role, clinic_id")
      .limit(1);
    
    res.json({ 
      ok: true, 
      message: "Backend is healthy",
      supabase_connected: !error,
      sample_clinic: clinics?.[0] || null,
      patients_schema_test: {
        success: !patientError,
        error: patientError?.message || null,
        columns_found: testPatient?.[0] || null
      }
    });
  } catch (err) {
    res.status(500).json({ 
      ok: false, 
      message: "Backend health check failed",
      error: err.message 
    });
  }
});

/* ================= PUBLIC CLINIC INFO (GET) ================= */
// Hasta uygulaması için public endpoint - clinic code ile clinic bilgilerini döner
app.get("/api/clinic/:clinicCode", async (req, res) => {
  try {
    const rawClinicCode = req.params.clinicCode || "";
    const clinicCode = String(rawClinicCode).trim().toUpperCase();
    
    console.log("[PUBLIC CLINIC] GET request received:", {
      rawClinicCode,
      trimmedClinicCode: clinicCode,
      params: req.params,
    });
    
    if (!clinicCode) {
      console.error("[PUBLIC CLINIC] Empty clinic code");
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }

    console.log("[PUBLIC CLINIC] Querying Supabase for clinic_code:", clinicCode);
    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("clinic_code", clinicCode)
      .single();

    if (error || !clinic) {
      console.error("[PUBLIC CLINIC] Clinic not found:", clinicCode, {
        errorCode: error?.code,
        errorMessage: error?.message,
        errorDetails: error?.details,
        hasClinic: !!clinic,
      });
      return res.status(404).json({ ok: false, error: "clinic_not_found", clinicCode });
    }

    // Şifre hash'ini döndürme
    const { password_hash, ...clinicData } = clinic;

    // Branding: Only Pro plan can show custom clinic logo/info
    // Free and Basic show standard Clinicator branding
    const plan = clinic.plan || "FREE";
    const branding = clinic.branding || {};
    const isPro = plan === "PRO";
    
    // For Pro: use branding logo/title if available, otherwise fallback to clinic logo/name
    // For Free/Basic: always hide clinic branding (show standard Clinicator branding)
    const logoUrl = isPro ? (branding.logoUrl || clinic.logo_url || "") : "";
    const displayName = isPro ? (branding.title || clinic.name || "") : "";
    const showPoweredBy = !isPro; // Free and Basic always show "Powered by Clinicator"

    const response = {
      ok: true,
      clinicCode: clinic.clinic_code,
      name: displayName || clinic.name || "", // For Free/Basic, name is still returned but branding is hidden
      address: clinic.address || "",
      phone: clinic.phone || "",
      email: clinic.email || "",
      website: clinic.website || "",
      logoUrl: logoUrl, // Empty for Free/Basic, custom logo for Pro
      googleMapsUrl: clinic.google_maps_url || "",
      whatsapp: clinic.phone || "", // WhatsApp için phone kullanılabilir
      plan: plan,
      branding: {
        showPoweredBy: showPoweredBy, // Free/Basic: true, Pro: false (unless explicitly set)
      },
      updatedAt: clinic.updated_at ? new Date(clinic.updated_at).getTime() : null,
    };
    
    console.log("Public clinic GET - Response:", JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Public clinic GET error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Fallback: /api/clinic endpoint'i (clinic code query parameter ile)
app.get("/api/clinic", async (req, res) => {
  try {
    const clinicCode = String(req.query.clinicCode || "").trim().toUpperCase();
    
    if (!clinicCode) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }

    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("clinic_code", clinicCode)
      .single();

    if (error || !clinic) {
      console.error("Public clinic GET (query) - Clinic not found:", clinicCode, error);
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

    // Şifre hash'ini döndürme
    const { password_hash, ...clinicData } = clinic;

    const response = {
      ok: true,
      clinicCode: clinic.clinic_code,
      name: clinic.name || "",
      address: clinic.address || "",
      phone: clinic.phone || "",
      email: clinic.email || "",
      website: clinic.website || "",
      logoUrl: clinic.logo_url || "",
      googleMapsUrl: clinic.google_maps_url || "",
      whatsapp: clinic.phone || "", // WhatsApp için phone kullanılabilir
      clinicType: clinic.clinic_type || "DENTAL",
      enabledModules: clinic.enabled_modules || [],
      updatedAt: clinic.updated_at ? new Date(clinic.updated_at).getTime() : null,
    };
    
    console.log("Public clinic GET (query) - Response:", JSON.stringify(response, null, 2));
    res.json(response);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Public clinic GET (query) error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN CLINIC (GET) ================= */
app.get("/api/admin/clinic", adminAuth, async (req, res) => {
  try {
    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("id", req.clinicId)
      .single();

    if (error || !clinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

    // Patient count hesapla
    const { count: patientCount, error: countError } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", req.clinicId);

    const currentPatientCount = patientCount || 0;
    const plan = clinic.plan || "FREE";
    
    // Calculate maxPatients based on plan if not set in database
    // Free: 3, Basic: 10, Pro: unlimited (null)
    let maxPatients = clinic.max_patients;
    if (maxPatients === null || maxPatients === undefined) {
      if (plan === "FREE") {
        maxPatients = 3;
      } else if (plan === "BASIC") {
        maxPatients = 10;
      } else if (plan === "PRO") {
        maxPatients = null; // Unlimited
      } else {
        maxPatients = 3; // Default to FREE plan limit
      }
    }
    
    // Branding bilgilerini parse et (JSONB)
    // Only Pro plan can customize branding
    const branding = clinic.branding || {};
    const isPro = plan === "PRO";
    const brandingTitle = isPro ? (branding.title || clinic.name || "") : "";
    const brandingLogoUrl = isPro ? (branding.logoUrl || clinic.logo_url || "") : "";
    const showPoweredBy = !isPro; // Free and Basic always show "Powered by Clinicator"

    // Şifre hash'ini döndürme
    const { password_hash, ...clinicData } = clinic;

    res.json({
      ok: true,
      clinicCode: clinic.clinic_code,
      name: clinic.name,
      address: clinic.address || "",
      phone: clinic.phone || "",
      email: clinic.email || "",
      website: clinic.website || "",
      logoUrl: clinic.logo_url || "",
      googleMapsUrl: clinic.google_maps_url || "",
      defaultInviterDiscountPercent: clinic.default_inviter_discount_percent,
      defaultInvitedDiscountPercent: clinic.default_invited_discount_percent,
      clinicType: clinic.clinic_type || "DENTAL",
      enabledModules: clinic.enabled_modules || [],
      plan: plan,
      maxPatients: maxPatients,
      currentPatientCount: currentPatientCount,
      branding: {
        title: brandingTitle,
        logoUrl: brandingLogoUrl,
        showPoweredBy: showPoweredBy,
        primaryColor: isPro ? (branding.primaryColor || "") : "",
        secondaryColor: isPro ? (branding.secondaryColor || "") : "",
        welcomeMessage: isPro ? (branding.welcomeMessage || "") : "",
      },
      updatedAt: clinic.updated_at ? new Date(clinic.updated_at).getTime() : null,
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Get clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN EVENTS (GET) ================= */
app.get("/api/admin/events", adminAuth, (req, res) => {
  res.json({ ok: true, events: [] });
});

/* ================= ADMIN CLINIC (PUT) ================= */
app.put("/api/admin/clinic", adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    console.log("[UPDATE CLINIC] Received body:", JSON.stringify(body, null, 2));
    console.log("[UPDATE CLINIC] Clinic ID:", req.clinicId);

    // Get current clinic to check plan
    const { data: currentClinic, error: currentClinicError } = await supabase
      .from("clinics")
      .select("plan, branding")
      .eq("id", req.clinicId)
      .single();

    if (currentClinicError || !currentClinic) {
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

    const currentPlan = String(currentClinic.plan || "FREE").trim().toUpperCase();
    const isPro = currentPlan === "PRO";
    const currentBranding = currentClinic.branding || {};

    const updateData = {
      name: body.name,
      address: body.address,
      phone: body.phone,
      email: body.email,
      website: body.website,
      logo_url: body.logoUrl,
      google_maps_url: body.googleMapsUrl,
      default_inviter_discount_percent: body.defaultInviterDiscountPercent,
      default_invited_discount_percent: body.defaultInvitedDiscountPercent,
    };
    
    // Add clinicType and enabledModules if provided (only DENTAL supported)
    if (body.clinicType) {
      const requestedType = String(body.clinicType).toUpperCase();
      if (requestedType === "DENTAL") {
        updateData.clinic_type = "DENTAL";
      }
      // HAIR type is no longer supported, ignore if provided
    }
    if (Array.isArray(body.enabledModules)) {
      updateData.enabled_modules = body.enabledModules;
    }
    
    // Add plan and maxPatients if provided
    if (body.plan) {
      const validPlans = ["FREE", "BASIC", "PRO"];
      if (validPlans.includes(String(body.plan).toUpperCase())) {
        const newPlan = String(body.plan).toUpperCase();
        updateData.plan = newPlan;
        // Update maxPatients based on plan: Free=3, Basic=10, Pro=unlimited
        updateData.max_patients = newPlan === "FREE" ? 3 : (newPlan === "BASIC" ? 10 : null);
        
        // Branding: Only Pro can customize. Free and Basic always show standard Clinicator branding
        if (newPlan !== "PRO") {
          // Reset branding for Free/Basic plans
          updateData.branding = {
            title: "",
            logoUrl: "",
            showPoweredBy: true, // Always show "Powered by Clinicator" for Free/Basic
          };
        }
      }
    }

    // Branding update: Only PRO clinics can set branding
    if (body.branding !== undefined || body.clinicName !== undefined || body.clinicLogoUrl !== undefined) {
      if (!isPro) {
        return res.status(403).json({
          ok: false,
          error: "BRANDING_NOT_ALLOWED",
          plan: currentPlan,
          message: "Branding customization is only available for PRO plan clinics. Please upgrade to PRO to customize branding."
        });
      }

      // Update branding for PRO clinics
      const newBranding = {
        ...currentBranding,
        title: body.clinicName !== undefined ? String(body.clinicName || "").trim() : (body.branding?.title !== undefined ? String(body.branding.title || "").trim() : currentBranding.title || ""),
        logoUrl: body.clinicLogoUrl !== undefined ? String(body.clinicLogoUrl || "").trim() : (body.branding?.logoUrl !== undefined ? String(body.branding.logoUrl || "").trim() : currentBranding.logoUrl || ""),
        showPoweredBy: body.branding?.showPoweredBy !== undefined ? !!body.branding.showPoweredBy : (currentBranding.showPoweredBy !== undefined ? currentBranding.showPoweredBy : false),
        primaryColor: body.branding?.primaryColor !== undefined ? String(body.branding.primaryColor || "").trim() : (currentBranding.primaryColor || ""),
        secondaryColor: body.branding?.secondaryColor !== undefined ? String(body.branding.secondaryColor || "").trim() : (currentBranding.secondaryColor || ""),
        welcomeMessage: body.branding?.welcomeMessage !== undefined ? String(body.branding.welcomeMessage || "").trim() : (currentBranding.welcomeMessage || ""),
      };

      updateData.branding = newBranding;
      console.log("[UPDATE CLINIC] Updating branding for PRO clinic:", newBranding);
    }
    
    // Get current clinic to check plan before updating
    const { data: currentClinicForBranding, error: currentClinicErrorForBranding } = await supabase
      .from("clinics")
      .select("plan, branding")
      .eq("id", req.clinicId)
      .single();

    const currentPlanForBranding = (updateData.plan || currentClinicForBranding?.plan || "FREE").toUpperCase();
    const isProForBranding = currentPlanForBranding === "PRO";
    const currentBrandingData = currentClinicForBranding?.branding || {};

    // Branding update: Only PRO clinics can set branding
    // Support both body.branding object and direct clinicName/clinicLogoUrl fields
    if (body.branding !== undefined || body.clinicName !== undefined || body.clinicLogoUrl !== undefined) {
      if (!isProForBranding) {
        return res.status(403).json({
          ok: false,
          error: "BRANDING_NOT_ALLOWED",
          plan: currentPlanForBranding,
          message: "Branding customization is only available for PRO plan clinics. Please upgrade to PRO to customize branding."
        });
      }

      // Update branding for PRO clinics
      const newBranding = {
        ...currentBrandingData,
        title: body.clinicName !== undefined ? String(body.clinicName || "").trim() : (body.branding?.title !== undefined ? String(body.branding.title || "").trim() : currentBrandingData.title || ""),
        logoUrl: body.clinicLogoUrl !== undefined ? String(body.clinicLogoUrl || "").trim() : (body.branding?.logoUrl !== undefined ? String(body.branding.logoUrl || "").trim() : currentBrandingData.logoUrl || ""),
        showPoweredBy: body.branding?.showPoweredBy !== undefined ? !!body.branding.showPoweredBy : (currentBrandingData.showPoweredBy !== undefined ? currentBrandingData.showPoweredBy : false),
        primaryColor: body.branding?.primaryColor !== undefined ? String(body.branding.primaryColor || "").trim() : (currentBrandingData.primaryColor || ""),
        secondaryColor: body.branding?.secondaryColor !== undefined ? String(body.branding.secondaryColor || "").trim() : (currentBrandingData.secondaryColor || ""),
        welcomeMessage: body.branding?.welcomeMessage !== undefined ? String(body.branding.welcomeMessage || "").trim() : (currentBrandingData.welcomeMessage || ""),
      };

      updateData.branding = newBranding;
      // Also update logo_url if clinicLogoUrl is provided (for backward compatibility)
      if (body.clinicLogoUrl !== undefined || body.branding?.logoUrl !== undefined) {
        updateData.logo_url = newBranding.logoUrl;
      }
      console.log("[UPDATE CLINIC] Updating branding for PRO clinic:", newBranding);
    }

    // Null değerleri temizle
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    console.log("[UPDATE CLINIC] Update data:", JSON.stringify(updateData, null, 2));

    const { data: updatedClinic, error } = await supabase
      .from("clinics")
      .update(updateData)
      .eq("id", req.clinicId)
      .select()
      .single();

    if (error) {
      console.error("[UPDATE CLINIC] Supabase update error:", error);
      return res.status(500).json({ ok: false, error: "update_failed", details: error.message });
    }

    console.log("[UPDATE CLINIC] Successfully updated:", updatedClinic.clinic_code);

    // Patient count hesapla
    const { count: patientCount, error: countError } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", req.clinicId);

    const currentPatientCount = patientCount || 0;
    const finalPlan = String(updatedClinic.plan || "FREE").trim().toUpperCase();
    
    // Calculate maxPatients based on plan if not set in database
    // Free: 3, Basic: 10, Pro: unlimited (null)
    let maxPatients = updatedClinic.max_patients;
    if (maxPatients === null || maxPatients === undefined) {
      if (finalPlan === "FREE") {
        maxPatients = 3;
      } else if (finalPlan === "BASIC") {
        maxPatients = 10;
      } else if (finalPlan === "PRO") {
        maxPatients = null; // Unlimited
      } else {
        maxPatients = 3; // Default to FREE plan limit
      }
    }
    
    // Branding bilgilerini parse et (JSONB)
    // Only Pro plan can customize branding
    const branding = updatedClinic.branding || {};
    const responseIsPro = finalPlan === "PRO";
    const brandingTitle = responseIsPro ? (branding.title || updatedClinic.name || "") : "";
    const brandingLogoUrl = responseIsPro ? (branding.logoUrl || updatedClinic.logo_url || "") : "";
    const showPoweredBy = !responseIsPro; // Free and Basic always show "Powered by Clinicator"

    const { password_hash, ...clinicData } = updatedClinic;

    res.json({
      ok: true,
      clinic: {
        clinicCode: updatedClinic.clinic_code,
        name: updatedClinic.name,
        address: updatedClinic.address || "",
        phone: updatedClinic.phone || "",
        email: updatedClinic.email || "",
        website: updatedClinic.website || "",
        logoUrl: updatedClinic.logo_url || "",
        googleMapsUrl: updatedClinic.google_maps_url || "",
        defaultInviterDiscountPercent: updatedClinic.default_inviter_discount_percent,
        defaultInvitedDiscountPercent: updatedClinic.default_invited_discount_percent,
        clinicType: updatedClinic.clinic_type || "DENTAL",
        enabledModules: updatedClinic.enabled_modules || [],
        plan: finalPlan,
        maxPatients: maxPatients,
        currentPatientCount: currentPatientCount,
        branding: {
          title: brandingTitle,
          logoUrl: brandingLogoUrl,
          showPoweredBy: showPoweredBy,
          primaryColor: responseIsPro ? (branding.primaryColor || "") : "",
          secondaryColor: responseIsPro ? (branding.secondaryColor || "") : "",
          welcomeMessage: responseIsPro ? (branding.welcomeMessage || "") : "",
        },
        updatedAt: updatedClinic.updated_at ? new Date(updatedClinic.updated_at).getTime() : null,
      },
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Update clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENTS (GET) ================= */
app.get("/api/admin/patients", adminAuth, async (req, res) => {
  try {
    console.log("[ADMIN PATIENTS] Request received");

    // Get patients with required fields only (exclude doctors)
    const { data: patients, error } = await supabase
      .from("patients")
      .select(`
        id,
        patient_id,
        name,
        phone,
        created_at
      `)
      .eq("clinic_id", req.admin.clinicId)
      .eq("role", "PATIENT") // Only show patients, not doctors
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN PATIENTS] Error:", error);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_patients" });
    }

    const list = (patients || []).map((p) => ({
      id: p.id,
      patient_id: p.patient_id,
      name: p.name || "",
      phone: p.phone || "",
      created_at: p.created_at
    }));

    console.log("[ADMIN PATIENTS] Success:", { count: list.length });

    res.json({ 
      ok: true, 
      patients: list  
    });
  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN PATIENTS] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENTS (POST - Create Patient) ================= */
app.post("/api/admin/patients", adminAuth, async (req, res) => {
  try {
    const { name, phone, referralCode: inviterReferralCodeRaw } = req.body || {};

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required", message: "Phone number is required" });
    }

    // Get clinic info (plan and maxPatients)
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, clinic_code, plan, max_patients")
      .eq("id", req.clinicId)
      .single();

    if (!clinic?.data) {
      console.error("[ADMIN CREATE PATIENT] Clinic lookup error:", clinicError);
      console.error("[ADMIN CREATE PATIENT] Clinic data:", JSON.stringify(clinic, null, 2));
      return res.status(400).json({
        ok: false,
        error: "invalid_clinic",
        message: "Geçersiz klinik kodu"
      });
    }

    console.log("[ADMIN CREATE PATIENT] Clinic found:", JSON.stringify(clinic, null, 2));

    // Patient limit kontrolü
    if (clinic.max_patients !== null && clinic.max_patients !== undefined) {
      const { count, error: countError } = await supabase
        .from("patients")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", req.clinicId);
      
      if (!countError) {
        const currentPatientCount = count || 0;
        console.log(`[ADMIN CREATE PATIENT] Current patient count: ${currentPatientCount} / ${clinic.max_patients}`);
        
        if (currentPatientCount >= clinic.max_patients) {
          return res.status(403).json({
            ok: false,
            error: "patient_limit_reached",
            message: `You have reached your patient limit (${clinic.max_patients}). Please upgrade your plan to add more patients.`,
            currentCount: currentPatientCount,
            maxPatients: clinic.max_patients,
            plan: clinic.plan || "FREE",
          });
        }
      }
    }

    // Generate patient code (same logic as /api/register)
    async function generatePatientCode() {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let attempts = 0;
      const maxAttempts = 100;
      
      while (attempts < maxAttempts) {
        let code = "";
        for (let i = 0; i < 5; i++) {
          code += chars[Math.floor(Math.random() * chars.length)];
        }
        
        const { data: existingById } = await supabase
          .from("patients")
          .select("patient_id")
          .eq("patient_id", code)
          .maybeSingle();
        
        let existingByCode = null;
        try {
          const { data } = await supabase
            .from("patients")
            .select("referral_code")
            .eq("referral_code", code)
            .maybeSingle();
          existingByCode = data;
        } catch (err) {
          // referral_code column may not exist
          console.warn("[ADMIN CREATE PATIENT] referral_code column check skipped:", err?.message);
        }
        
        if (!existingById && !existingByCode) {
          return code;
        }
        attempts++;
      }
      
      const fallbackCode = Date.now().toString().slice(-5);
      return fallbackCode.padStart(5, '0');
    }
    
    const patientCode = await generatePatientCode();
    const nextPatientId = patientCode;
    const referralCode = patientCode;

    // Create patient
    let newPatient;
    let patientError;
    
    const { data: patientWithCode, error: errorWithCode } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        patient_id: nextPatientId,
        referral_code: referralCode,
        name: name || "",
        phone: String(phone).trim(),
        status: "PENDING",
      })
      .select()
      .single();
    
    if (errorWithCode && errorWithCode.message && errorWithCode.message.includes("referral_code")) {
      console.warn("[ADMIN CREATE PATIENT] referral_code column not found, inserting without referral_code");
      const { data: patientWithoutCode, error: errorWithoutCode } = await supabase
        .from("patients")
        .insert({
          clinic_id: clinic.id,
          patient_id: nextPatientId,
          name: name || "",
          phone: String(phone).trim(),
          status: "PENDING",
        })
        .select()
        .single();
      
      newPatient = patientWithoutCode;
      patientError = errorWithoutCode;
    } else {
      newPatient = patientWithCode;
      patientError = errorWithCode;
    }

    if (patientError || !newPatient) {
      console.error("[ADMIN CREATE PATIENT] Patient creation error:", patientError);
      return res.status(500).json({ 
        ok: false, 
        error: "patient_creation_failed",
        details: patientError?.message || "Failed to create patient"
      });
    }

    console.log(`[ADMIN CREATE PATIENT] Patient created: ${newPatient.patient_id} for clinic ${clinic.clinic_code}`);

    // Optional: create referral record if admin provided a referral code (inviter patientId).
    // This makes new "pending" referrals show up in admin referrals list.
    const inviterReferralCode = String(inviterReferralCodeRaw || "").trim();
    if (inviterReferralCode) {
      const code = inviterReferralCode.toUpperCase();
      console.log(`[ADMIN CREATE PATIENT] Referral code provided: ${code}. Looking up inviter in clinic ${clinic.clinic_code}`);

      const { data: inviterPatient, error: inviterErr } = await supabase
        .from("patients")
        .select("id, name, name, clinic_id")
        .eq("patient_id", code)
        .eq("clinic_id", clinic.id)
        .maybeSingle();

      if (inviterErr || !inviterPatient) {
        console.error("[ADMIN CREATE PATIENT] Invalid referral code (inviter not found):", { code, inviterErr });
        // Rollback created patient to avoid silently creating without intended referral link
        try {
          await supabase.from("patients").delete().eq("id", newPatient.id);
          console.log("[ADMIN CREATE PATIENT] Rolled back patient due to invalid referral code:", newPatient.patient_id);
        } catch (rbErr) {
          console.error("[ADMIN CREATE PATIENT] Rollback failed:", rbErr?.message || rbErr);
        }
        return res.status(400).json({
          ok: false,
          error: "invalid_referral_code",
          message: `Referral code "${code}" is invalid for this clinic.`,
        });
      }

      const referralId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const referralData = {
        referral_id: referralId,
        clinic_id: clinic.id,
        inviter_patient_id: inviterPatient.id,
        inviter_patient_name: inviterPatient.name || "",
        invited_patient_id: newPatient.id,
        invited_patient_name: newPatient.name || "",
        status: "pending",
      };

      const { error: refErr } = await supabase
        .from("referrals")
        .insert(referralData);

      if (refErr) {
        console.error("[ADMIN CREATE PATIENT] Failed to create referral:", refErr);
        // Rollback patient to keep data consistent
        try {
          await supabase.from("patients").delete().eq("id", newPatient.id);
          console.log("[ADMIN CREATE PATIENT] Rolled back patient due to referral insert failure:", newPatient.patient_id);
        } catch (rbErr) {
          console.error("[ADMIN CREATE PATIENT] Rollback failed:", rbErr?.message || rbErr);
        }
        return res.status(500).json({
          ok: false,
          error: "referral_create_failed",
          details: refErr.message,
        });
      }

      console.log(`[ADMIN CREATE PATIENT] Referral created: ${referralId} (pending)`);
    }

    res.json({
      ok: true,
      patientId: newPatient.name,
      referralCode: newPatient.referral_code || newPatient.name,
      name: newPatient.name || "",
      phone: newPatient.phone || "",
      status: newPatient.status,
      createdAt: newPatient.created_at ? new Date(newPatient.created_at).getTime() : Date.now(),
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN CREATE PATIENT] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error", details: error?.message });
  }
});

/* ================= PATIENT REGISTER ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { name, fullName, phone, clinicCode, referralCode: inviterReferralCode, userType, department, specialties, title, experienceYears, languages } = req.body || {};

    // fullName veya name kabul et (backward compatibility için)
    const patientName = fullName || name;
    
    // Determine role based on userType
    const role = userType === "doctor" ? "DOCTOR" : "PATIENT";
    
    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required" });
    }

    if (!patientName || !String(patientName).trim()) {
      return res.status(400).json({ ok: false, error: "full_name_required", message: "Full name is required" });
    }

    // Doctor-specific validation
    if (role === "DOCTOR") {
      if (!department || !String(department).trim()) {
        return res.status(400).json({ ok: false, error: "department_required", message: "Department is required for doctors" });
      }
      if (!specialties || !Array.isArray(specialties) || specialties.length === 0) {
        return res.status(400).json({ ok: false, error: "specialties_required", message: "At least one specialty is required for doctors" });
      }
    }

    const trimmedClinicCode = String(clinicCode).trim().toUpperCase();
    console.log(`[REGISTER] Attempting to register patient for clinic: ${trimmedClinicCode}`);

    // Klinik bul (plan ve maxPatients dahil)
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, clinic_code, name, plan, max_patients")
      .eq("clinic_code", trimmedClinicCode)
      .single();

    if (clinicError) {
      console.error(`[REGISTER] Clinic lookup error for "${trimmedClinicCode}":`, clinicError);
      
      // Daha detaylı hata mesajı
      if (clinicError.code === "PGRST116") {
        // No rows returned
        return res.status(404).json({ 
          ok: false, 
          error: "clinic_not_found",
          message: `Clinic code "${trimmedClinicCode}" not found in database. Please register the clinic first.`
        });
      }
      
      return res.status(500).json({ 
        ok: false, 
        error: "clinic_lookup_failed",
        details: clinicError.message 
      });
    }

    if (!clinic) {
      console.error(`[REGISTER] Clinic not found: ${trimmedClinicCode}`);
      return res.status(404).json({ 
        ok: false, 
        error: "clinic_not_found",
        message: `Clinic code "${trimmedClinicCode}" not found in database. Please register the clinic first.`
      });
    }

    console.log(`[REGISTER] Clinic found: ${clinic.name} (${clinic.clinic_code}), ID: ${clinic.id}, Plan: ${clinic.plan || "FREE"}`);

    // Check if phone already exists
    const { data: existingPatient, error: phoneCheckError } = await supabase
      .from("patients")
      .select("name, phone, name")
      .eq("phone", phone.trim())
      .single();

    if (phoneCheckError && phoneCheckError.code !== "PGRST116") {
      console.error("[REGISTER] Phone check error:", phoneCheckError);
      return res.status(500).json({ 
        ok: false, 
        error: "phone_check_failed", 
        details: phoneCheckError.message 
      });
    }

    if (existingPatient) {
      console.log("[REGISTER] Phone already exists:", {
        phone: phone.trim(),
        existingPatientId: existingPatient.name,
        existingName: existingPatient.name
      });
      return res.status(400).json({ 
        ok: false, 
        error: "phone_already_exists",
        message: `Bu telefon numarası zaten kayıtlı: ${existingPatient.name}. Lütfen farklı bir numara kullanın.` 
      });
    }

    // Check plan limits
    const plan = String(clinic.plan || "FREE").trim().toUpperCase();
    let maxPatients = clinic.max_patients;
    
    // Calculate maxPatients based on plan if not set in database
    if (maxPatients === null || maxPatients === undefined) {
      if (plan === "FREE") {
        maxPatients = 3;
      } else if (plan === "BASIC") {
        maxPatients = 10;
      } else if (plan === "PRO") {
        maxPatients = null; // Unlimited for PRO
      } else {
        maxPatients = 3; // Default to FREE plan limit
      }
    }

    // Check patient limit (PRO has unlimited, so skip check)
    if (maxPatients !== null && maxPatients !== undefined && plan !== "PRO") {
      const { count, error: countError } = await supabase
        .from("patients")
        .select("*", { count: "exact", head: true })
        .eq("clinic_id", clinic.id);
      
      if (!countError) {
        const currentPatientCount = count || 0;
        console.log(`[REGISTER] Current patient count: ${currentPatientCount} / ${maxPatients} (Plan: ${plan})`);
        
        if (currentPatientCount >= maxPatients) {
          return res.status(403).json({
            ok: false,
            error: "PLAN_LIMIT_REACHED",
            plan: plan,
            maxPatients: maxPatients,
            currentCount: currentPatientCount,
            message: `Clinic has reached the patient limit for ${plan} plan (${maxPatients} patients). Please upgrade to add more patients.`
          });
        }
      } else {
        console.warn("[REGISTER] Error counting patients, continuing anyway:", countError);
      }
    } else if (plan === "PRO") {
      console.log("[REGISTER] PRO plan - unlimited patients, skipping limit check");
    }

    const nextPatientId = await generatePatientIdFromName(patientName);
    const referralCode = nextPatientId; // Referral Code = Patient ID (aynı)
    console.log(`[REGISTER] Generated patient ID from name "${patientName}": ${nextPatientId}`);

    // Hasta kaydı oluştur (patient_id = referral_code = 5 haneli kod)
    // referral_code kolonu varsa ekle, yoksa sadece patient_id kullan
    let newPatient;
    let patientError;
    
    // Önce referral_code ile dene
    const { data: patientWithCode, error: errorWithCode } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        patient_id: nextPatientId, // Patient ID from name
        referral_code: referralCode, // Referral Code = Patient ID (aynı)
        name: String(patientName).trim(), // fullName veya name
        phone: String(phone).trim(),
        role: role, // Add role information
        status: role === "DOCTOR" ? "PENDING" : "ACTIVE", // CRITICAL: Set status based on role
        department: role === "DOCTOR" ? department : null,
        specialties: role === "DOCTOR" ? specialties : [],
        title: role === "DOCTOR" ? title : null,
        experience_years: role === "DOCTOR" ? experienceYears : null,
        languages: role === "DOCTOR" ? languages : [],
      })
      .select()
      .single();
    
    // Eğer referral_code kolonu yoksa hatayı yakala ve referral_code olmadan tekrar dene
    if (errorWithCode && errorWithCode.message && errorWithCode.message.includes("referral_code")) {
      console.warn("[REGISTER] referral_code column not found, inserting without referral_code:", errorWithCode.message);
      const { data: patientWithoutCode, error: errorWithoutCode } = await supabase
        .from("patients")
        .insert({
          clinic_id: clinic.id,
          patient_id: nextPatientId, // Patient ID from name
          name: String(patientName).trim(), // fullName veya name
          phone: String(phone).trim(),
          role: role, // Add role information
          status: role === "DOCTOR" ? "PENDING" : "ACTIVE", // CRITICAL: Set status based on role
          department: role === "DOCTOR" ? department : null,
          specialties: role === "DOCTOR" ? specialties : [],
          title: role === "DOCTOR" ? title : null,
          experience_years: role === "DOCTOR" ? experienceYears : null,
          languages: role === "DOCTOR" ? languages : [],
        })
        .select()
        .single();
      
      newPatient = patientWithoutCode;
      patientError = errorWithoutCode;
    } else {
      newPatient = patientWithCode;
      patientError = errorWithCode;
    }

    if (patientError) {
      console.error("[REGISTER] Create patient error:", patientError);
      return res.status(500).json({ 
        ok: false, 
        error: "registration_failed",
        details: patientError.message 
      });
    }

    console.log(`[REGISTER] Patient created successfully: ${newPatient.patient_id} for clinic ${trimmedClinicCode}`);

    // Eğer referral code verilmişse, referral kaydı oluştur (inviter'in referral code'u)
    if (inviterReferralCode && String(inviterReferralCode).trim()) {
      const trimmedReferralCode = String(inviterReferralCode).trim().toUpperCase();
      console.log(`[REGISTER] Referral code provided: ${trimmedReferralCode}`);
      
      // Referral code'a sahip hasta bul (inviter)
      // Önce referral_code ile ara, bulamazsa patient_id ile ara
      // Referral code = Patient ID (aynı kod), bu yüzden her ikisini de kontrol ediyoruz
      let inviterPatient = null;
      let inviterError = null;
      
      console.log(`[REGISTER] Searching for referral code: ${trimmedReferralCode} in clinic: ${clinic.id} (${clinic.clinic_code})`);
      
      // Referral code = Patient ID (aynı kod), bu yüzden patient_id ile ara
      // referral_code kolonu olmayabilir, bu yüzden sadece patient_id kullan
      const { data: inviterById, error: errorById } = await supabase
        .from("patients")
        .select("id, name, name, clinic_id")
        .eq("patient_id", trimmedReferralCode)
        .eq("clinic_id", clinic.id)
        .maybeSingle();
      
      console.log(`[REGISTER] Search by patient_id result:`, {
        found: !!inviterById,
        error: errorById?.message,
        patientId: inviterById?.name,
        clinicId: inviterById?.clinic_id,
        name: inviterById?.name,
      });
      
      if (!errorById && inviterById) {
        inviterPatient = inviterById;
        console.log(`[REGISTER] Found inviter by patient_id: ${inviterById.patient_id} (${inviterById.name || "No name"})`);
      } else {
        inviterError = errorById;
        console.log(`[REGISTER] Not found by patient_id. Error:`, inviterError?.message);
        
        // Debug: Tüm patient_id'leri listele (aynı clinic'te) - referral code'ları görmek için
        const { data: allPatients, error: allError } = await supabase
          .from("patients")
          .select("name, name")
          .eq("clinic_id", clinic.id)
          .limit(20);
        
        if (!allError && allPatients) {
          console.log(`[REGISTER] Available patient IDs (referral codes) in clinic ${clinic.clinic_code}:`, 
            allPatients.map(p => ({
              patientId: p.name,
              name: p.name,
            }))
          );
        } else {
          console.log(`[REGISTER] Error fetching patient list:`, allError?.message);
        }
      }
      
      if (!inviterError && inviterPatient && inviterPatient.clinic_id === clinic.id) {
        // Referral kaydı oluştur (UUID kullan)
        const referralId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const referralData = {
          referral_id: referralId,
          clinic_id: clinic.id,
          inviter_patient_id: inviterPatient.id, // UUID
          inviter_patient_name: inviterPatient.name || "",
          invited_patient_id: newPatient.id, // UUID
          invited_patient_name: newPatient.name || "",
          status: "pending", // Default pending (DB expects lowercase)
        };
        
        console.log(`[REGISTER] Creating referral record:`, {
          referralId,
          clinicId: clinic.id,
          inviterPatientId: inviterPatient.name,
          invitedPatientId: newPatient.name,
          status: "pending",
        });
        
        const { data: createdReferral, error: referralError } = await insertReferralWithColumnPruning(referralData);

        if (referralError) {
          console.error("[REGISTER] Failed to create referral record:", referralError);
          console.error("[REGISTER] Referral data:", referralData);

          // Referral kaydı kritik: rollback patient (referralCode ile kayıt yapılan akışta sessizce geçmeyelim)
          try {
            await supabase.from("patients").delete().eq("id", newPatient.id);
            console.log("[REGISTER] Patient rolled back due to referral insert failure:", newPatient.patient_id);
          } catch (rbErr) {
            console.error("[REGISTER] Failed to rollback patient after referral insert failure:", rbErr?.message || rbErr);
          }

          return res.status(500).json({
            ok: false,
            error: "referral_create_failed",
            message: "Referral could not be created. Please try again.",
            details: referralError.message,
          });
        }

        console.log(`[REGISTER] Referral record created successfully:`, {
          referralId: createdReferral.referral_id || createdReferral.id,
          status: createdReferral.status || "NULL",
          inviter: inviterPatient.name,
          invited: newPatient.name,
        });
      } else {
        // Referral code geçersiz - hasta kaydını iptal et
        console.error(`[REGISTER] Invalid referral code: ${trimmedReferralCode}`);
        console.error(`[REGISTER] Inviter error:`, inviterError);
        console.error(`[REGISTER] Inviter patient:`, inviterPatient);
        
        // Hasta kaydını sil (rollback)
        try {
          await supabase
            .from("patients")
            .delete()
            .eq("id", newPatient.id);
          console.log(`[REGISTER] Patient record rolled back due to invalid referral code`);
        } catch (rollbackError) {
          console.error(`[REGISTER] Failed to rollback patient record:`, rollbackError);
        }
        
        return res.status(400).json({ 
          ok: false, 
          error: "invalid_referral_code",
          message: `Referral code "${trimmedReferralCode}" is invalid or not found. Please check the code and try again.`
        });
      }
    }

    // Patient için JWT token oluştur (frontend token bekliyor)
    const patientToken = jwt.sign(
      { 
        patientId: newPatient.name, 
        clinicId: clinic.id,
        clinicCode: trimmedClinicCode,
        role: role, // DOCTOR or PATIENT
        roleType: role, // Same as role for consistency
        status: newPatient.status || (role === "DOCTOR" ? "PENDING" : "ACTIVE") // Set status based on role
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Response'ta name field'ını düzgün döndür - patientName endpoint başında tanımlı
    const finalName = String(patientName || newPatient.name || "").trim();
    console.log(`[REGISTER] Response name: "${finalName}" (from patientName: "${patientName}", newPatient.name: "${newPatient.name}")`);

    res.json({
      ok: true,
      token: patientToken, // Frontend token bekliyor
      patientId: newPatient.name,
      referralCode: newPatient.referral_code || null,
      requestId: newPatient.name, // Backward compatibility
      name: finalName, // Name from request (patientName)
      phone: String(newPatient.phone || phone || "").trim(),
      status: newPatient.status || (role === "DOCTOR" ? "PENDING" : "ACTIVE"), // Set status based on role
      role: role, // Add role to response
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[REGISTER] Unexpected error:", error);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error",
      message: error?.message || "Unknown error occurred"
    });
  }
});

/* ================= ADMIN TOKEN TEST ================= */
app.get("/api/admin/token-test", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  
  console.log("[TOKEN TEST] Token:", token);
  
  if (!token) {
    return res.json({ ok: false, error: "missing_token" });
  }
  
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, 'clinifly_admin_secret_2024');
    console.log("[TOKEN TEST] Decoded:", decoded);
    res.json({ ok: true, decoded });
  } catch (error) {
    console.log("[TOKEN TEST] Error:", error.message);
    res.json({ ok: false, error: error.message });
  }
});

/* ================= ADMIN TEST ================= */
app.get("/api/admin/test", adminAuth, async (req, res) => {
  res.json({ 
    ok: true, 
    message: "Admin auth working",
    admin: req.admin 
  });
});

/* ================= ADMIN DOCTOR APPROVAL ================= */
app.post("/api/admin/approve-doctor", adminAuth, async (req, res) => {
  try {
    const { doctorId } = req.body || {};

    if (!doctorId) {
      return res.status(400).json({ ok: false, error: "doctorId_required" });
    }

    const trimmedDoctorId = String(doctorId).trim();
    const clinicId = req.admin?.clinicId;

    if (!clinicId) {
      return res.status(400).json({
        ok: false,
        error: "clinic_not_found"
      });
    }

    console.log("[ADMIN APPROVE DOCTOR] Approving doctor:", { 
      doctorId: trimmedDoctorId, 
      clinicId: clinicId,
      clinicCode: req.admin.clinicCode
    });

    // Doctor bul (sadece bu klinik için)
    const { data: doctor, error: findError } = await supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("doctor_id", trimmedDoctorId)
      .single();

    if (findError || !doctor) {
      console.error("[ADMIN APPROVE DOCTOR] Doctor not found:", findError);
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    // Doctor durumunu APPROVED yap
    const { data: updatedDoctor, error: updateError } = await supabase
      .from("doctors")
      .update({ 
        status: "APPROVED", 
        approved_at: new Date().toISOString() 
      })
      .eq("id", doctor.id)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN APPROVE DOCTOR] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "approval_failed" });
    }

    console.log("[ADMIN APPROVE DOCTOR] Doctor approved successfully:", updatedDoctor.full_name);

    res.json({
      ok: true,
      doctorId: updatedDoctor.doctor_id,
      status: updatedDoctor.status,
      message: "Doctor approved successfully",
    });

  } catch (err) {
    console.error("[ADMIN APPROVE DOCTOR] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN DOCTOR APPROVAL V2 ================= */
app.post("/admin/approve-doctor-v2", adminAuth, async (req, res) => {
  try {
    const { doctorId } = req.body || {};

    if (!doctorId) {
      return res.status(400).json({ ok: false, error: "doctorId_required" });
    }

    const trimmedDoctorId = String(doctorId).trim();
    const clinicId = req.admin?.clinicId;

    if (!clinicId) {
      return res.status(400).json({
        ok: false,
        error: "clinic_not_found"
      });
    }

    console.log("[ADMIN APPROVE DOCTOR V2] Approving doctor:", { 
      doctorId: trimmedDoctorId, 
      clinicId: clinicId,
      clinicCode: req.admin.clinicCode
    });

    // Doctor bul (sadece bu klinik için)
    const { data: doctor, error: findError } = await supabase
      .from("doctors")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("doctor_id", trimmedDoctorId)
      .single();

    if (findError || !doctor) {
      console.error("[ADMIN APPROVE DOCTOR V2] Doctor not found:", findError);
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    // Doctor durumunu APPROVED yap
    const { data: updatedDoctor, error: updateError } = await supabase
      .from("doctors")
      .update({ 
        status: "APPROVED", 
        approved_at: new Date().toISOString() 
      })
      .eq("id", doctor.id)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN APPROVE DOCTOR V2] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "approval_failed" });
    }

    console.log("[ADMIN APPROVE DOCTOR V2] Doctor approved successfully:", updatedDoctor.full_name);

    res.json({
      ok: true,
      doctorId: updatedDoctor.doctor_id,
      status: updatedDoctor.status,
      message: "Doctor approved successfully",
    });

  } catch (err) {
    console.error("[ADMIN APPROVE DOCTOR V2] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN APPROVE ================= */
app.post("/api/admin/approve", adminAuth, async (req, res) => {
  try {
    const { requestId, patientId } = req.body || {};

    if (!requestId && !patientId) {
      return res.status(400).json({ ok: false, error: "requestId_or_patientId_required" });
    }

    const targetPatientId = patientId || requestId;
    const trimmedPatientId = String(targetPatientId).trim();

    // CLINIC FALLBACK LOGIC FOR DEV/TEST
    let clinicId = req.admin?.clinicId;
    
    // DEV / TEST fallback - use patient's clinic_id if admin clinic not available
    if (!clinicId && trimmedPatientId) {
      console.log("[ADMIN APPROVE] Using patient clinic fallback");
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("clinic_id")
        .eq("patient_id", trimmedPatientId)
        .single();
      
      if (!patientError && patient) {
        clinicId = patient.clinic_id;
        console.log("[ADMIN APPROVE] Found clinic from patient:", clinicId);
      }
    }

    if (!clinicId) {
      return res.status(400).json({
        ok: false,
        error: "clinic_not_found"
      });
    }

    console.log("[ADMIN APPROVE] Approving patient:", { 
      targetPatientId: trimmedPatientId, 
      clinicId: clinicId,
      clinicCode: req.admin.clinicCode
    });

    // Hasta bul (sadece bu klinik için)
    const { data: patient, error: findError } = await supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("patient_id", trimmedPatientId)
      .single();

    if (findError || !patient) {
      console.error("[ADMIN APPROVE] Patient not found:", findError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Hasta durumunu APPROVED yap
    const { data: updatedPatient, error: updateError } = await supabase
      .from("patients")
      .update({ status: "APPROVED" })
      .eq("id", patient.id)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN APPROVE] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "approval_failed" });
    }

    console.log("[ADMIN APPROVE] Patient approved successfully:", updatedPatient.name);

    res.json({
      ok: true,
      patientId: updatedPatient.name,
      status: updatedPatient.status,
      message: "Patient approved successfully",
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN APPROVE] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= PATIENT ME (Status) ================= */
app.get("/api/patient/me", async (req, res) => {
  try {
    // Get token from Authorization header or x-patient-token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const token = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const patientId = decoded.patientId;
      const clinicId = decoded.clinicId;

      if (!patientId || !clinicId) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }

      // Patient bilgilerini Supabase'den al
      // patientId token'da TEXT formatında (örn: "p1"), Supabase'de patient_id kolonunda
      const { data: patient, error } = await supabase
        .from("patients")
        .select("name, name, phone, email, status, role, clinic_id, created_at, referral_code")
        .eq("patient_id", String(patientId))
        .eq("clinic_id", clinicId)
        .single();

      if (error || !patient) {
        console.warn(`[PATIENT ME] Patient not found: ${patientId} in clinic ${clinicId}`);
        console.warn(`[PATIENT ME] Supabase error:`, error);
        console.warn(`[PATIENT ME] Token decoded:`, { patientId: decoded.patientId, clinicId: decoded.clinicId, clinicCode: decoded.clinicCode });
        
        // Hasta bulunamadı - token geçersiz veya hasta silinmiş
        return res.status(404).json({ 
          ok: false, 
          error: "patient_not_found",
          message: `Patient ${patientId} not found in clinic ${clinicId}. Please re-register.`,
          patientId: decoded.patientId,
          clinicId: decoded.clinicId,
        });
      }

      // Get clinic info for branding
      const { data: clinicInfo, error: clinicInfoError } = await supabase
        .from("clinics")
        .select("plan, branding, name, logo_url")
        .eq("id", clinicId)
        .single();

      const clinicPlan = clinicInfo?.plan || "FREE";
      const isPro = String(clinicPlan).trim().toUpperCase() === "PRO";
      const clinicBranding = clinicInfo?.branding || {};
      
      // Only return branding for PRO clinics
      const branding = isPro ? {
        clinicName: clinicBranding.title || clinicInfo?.name || "",
        clinicLogoUrl: clinicBranding.logoUrl || clinicInfo?.logo_url || "",
      } : {
        clinicName: "",
        clinicLogoUrl: "",
      };

      const response = {
        ok: true,
        patientId: patient.name,
        referralCode: patient.referral_code || null,
        name: patient.name || "",
        phone: patient.phone || "",
        status: patient.status || "PENDING",
        role: patient.role || "PATIENT",
        email: patient.email || "",
        clinicCode: decoded.clinicCode || null,
        clinicId: decoded.clinicId || null,
        clinicPlan: clinicPlan,
        branding: branding,
        createdAt: patient.created_at ? new Date(patient.created_at).getTime() : null,
      };
      
      console.log("[PATIENT ME] Response:", JSON.stringify(response, null, 2));
      console.log("[PATIENT ME] Decoded clinicCode:", decoded.clinicCode, "Plan:", clinicPlan, "IsPro:", isPro);
      res.json(response);
    } catch (jwtError) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Patient me error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR AUTH MIDDLEWARE ================= */
function verifyDoctorToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return { ok: false, code: "missing_token" };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user has DOCTOR role
    if (decoded.role !== "DOCTOR") {
      return { ok: false, code: "insufficient_permissions" };
    }

    return { 
      ok: true, 
      decoded: {
        doctorId: decoded.doctorId,
        patientId: decoded.doctorId, // For compatibility with existing code
        clinicId: decoded.clinicId,
        clinicCode: decoded.clinicCode,
        role: decoded.role
      }
    };
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    return { ok: false, code: "invalid_token" };
  }
}

/* ================= PATIENT AUTH MIDDLEWARE ================= */
function verifyPatientToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return { ok: false, code: "missing_token" };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user has PATIENT role
    if (decoded.role !== "PATIENT") {
      return { ok: false, code: "insufficient_permissions" };
    }

    return { 
      ok: true, 
      decoded: {
        patientId: decoded.patientId,
        clinicId: decoded.clinicId,
        clinicCode: decoded.clinicCode,
        role: decoded.role
      }
    };
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    return { ok: false, code: "invalid_token" };
  }
}

/* ================= ROLE-BASED ACCESS CONTROL ================= */
function checkDoctorSelfAccess(doctorId, targetPatientId) {
  // Doctor cannot access their own treatment data as a patient
  return doctorId === targetPatientId;
}

/* ================= DOCTOR DASHBOARD STATS ================= */
app.get("/api/doctor/dashboard/stats", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;

    // Get today's appointments count
    const today = new Date().toISOString().split('T')[0];
    const { count: todayAppointments } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("date", today)
      .neq("status", "cancelled");

    // Get pending procedures count
    const { count: pendingProcedures } = await supabase
      .from("treatment_plans")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "planned")
      .lt("planned_date", today);

    // Get waiting patients count
    const { count: waitingPatients } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("status", "PENDING");

    // Get total patients count
    const { count: totalPatients } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId);

    res.json({
      ok: true,
      stats: {
        todayAppointments: todayAppointments || 0,
        pendingProcedures: pendingProcedures || 0,
        waitingPatients: waitingPatients || 0,
        totalPatients: totalPatients || 0,
      }
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR DASHBOARD STATS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR DASHBOARD APPOINTMENTS ================= */
app.get("/api/doctor/dashboard/appointments", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;
    const today = new Date().toISOString().split('T')[0];

    // Get today's appointments with patient info
    const { data: appointments, error } = await supabase
      .from("appointments")
      .select(`
        *,
        patients!inner(
          name,
          name
        )
      `)
      .eq("clinic_id", clinicId)
      .eq("date", today)
      .neq("status", "cancelled")
      .order("time", { ascending: true });

    if (error) {
      console.error("[DOCTOR DASHBOARD APPOINTMENTS] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const formattedAppointments = appointments.map(apt => ({
      id: apt.id,
      patientName: apt.patients.name,
      time: apt.time,
      procedure: apt.procedure || "Genel Kontrol",
      status: apt.status,
    }));

    res.json({
      ok: true,
      appointments: formattedAppointments
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR DASHBOARD APPOINTMENTS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR PATIENTS ================= */
app.get("/api/doctor/patients", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;

    // Get all patients for this clinic
    const { data: patients, error } = await supabase
      .from("patients")
      .select(`
        id,
        name,
        name,
        phone,
        email,
        status,
        created_at
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[DOCTOR PATIENTS] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const formattedPatients = patients.map(patient => ({
      id: patient.id,
      patientId: patient.name,
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      status: patient.status,
      createdAt: new Date(patient.created_at).getTime(),
    }));

    res.json({
      ok: true,
      patients: formattedPatients
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR PATIENTS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR TREATMENT PLANS ================= */
app.get("/api/doctor/treatment-plans", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;

    // Get all treatment plans with patient info
    const { data: treatmentPlans, error } = await supabase
      .from("treatment_plans")
      .select(`
        *,
        patients!inner(
          name,
          name
        )
      `)
      .eq("clinic_id", clinicId)
      .order("planned_date", { ascending: false });

    if (error) {
      console.error("[DOCTOR TREATMENT PLANS] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const formattedPlans = treatmentPlans.map(plan => ({
      id: plan.id,
      patientId: plan.patients.name,
      patientName: plan.patients.name,
      toothNumber: plan.tooth_number,
      diagnosis: plan.diagnosis,
      procedure: plan.procedure,
      price: plan.price,
      status: plan.status,
      plannedDate: plan.planned_date,
      completedDate: plan.completed_date,
      notes: plan.notes,
    }));

    res.json({
      ok: true,
      treatmentPlans: formattedPlans
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR TREATMENT PLANS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR CREATE TREATMENT PLAN ================= */
app.post("/api/doctor/treatment-plans", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;
    const { patientId, toothNumber, diagnosis, procedure, price, plannedDate, notes } = req.body || {};

    // Validation
    if (!patientId || !toothNumber || !diagnosis || !procedure || !price || !plannedDate) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    // Get patient info to verify they belong to this clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Create treatment plan
    const { data: treatmentPlan, error: treatmentError } = await supabase
      .from("treatment_plans")
      .insert({
        clinic_id: clinicId,
        patient_id: patient.id,
        tooth_number: toothNumber,
        diagnosis: diagnosis,
        procedure: procedure,
        price: price,
        planned_date: plannedDate,
        notes: notes,
        status: "planned",
      })
      .select()
      .single();

    if (treatmentError) {
      console.error("[DOCTOR CREATE TREATMENT PLAN] Error:", treatmentError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({
      ok: true,
      treatmentPlan: treatmentPlan
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR CREATE TREATMENT PLAN] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR TREATMENT ENDPOINTS ================= */

// Get patient info for doctor
app.get("/api/doctor/patient/:patientId", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, patientId: doctorId } = v.decoded;
    const { patientId } = req.params;

    // Doctor cannot access their own treatment data
    if (checkDoctorSelfAccess(doctorId, patientId)) {
      return res.status(403).json({ ok: false, error: "self_access_denied" });
    }

    // Get patient info
    const { data: patient, error } = await supabase
      .from("patients")
      .select(`
        id,
        name,
        name,
        status,
        created_at,
        last_visit
      `)
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (error || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    res.json({
      ok: true,
      patient: {
        id: patient.id,
        patientId: patient.name,
        name: patient.name,
        status: patient.status === "APPROVED" ? "Active" : "Pending",
        lastVisit: patient.last_visit,
      }
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR PATIENT INFO] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Get patient teeth data
app.get("/api/doctor/treatment/:patientId/teeth", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, patientId: doctorId } = v.decoded;
    const { patientId } = req.params;

    // Doctor cannot access their own treatment data
    if (checkDoctorSelfAccess(doctorId, patientId)) {
      return res.status(403).json({ ok: false, error: "self_access_denied" });
    }

    // Get patient info first to verify access
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get teeth data
    const { data: teeth, error } = await supabase
      .from("teeth")
      .select("*")
      .eq("patient_id", patient.id)
      .order("fdi_number");

    if (error) {
      console.error("[DOCTOR TEETH] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const formattedTeeth = teeth.map(tooth => ({
      fdiNumber: tooth.fdi_number,
      status: tooth.status,
      diagnosis: tooth.diagnosis || [],
      procedures: tooth.procedures || [],
      notes: tooth.notes,
      plannedDate: tooth.planned_date,
      price: tooth.price,
    }));

    res.json({
      ok: true,
      teeth: formattedTeeth
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR TEETH] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Get treatment records
app.get("/api/doctor/treatment/:patientId/records", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;
    const { patientId } = req.params;

    // Get patient info first to verify access
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get treatment records
    const { data: records, error } = await supabase
      .from("treatment_records")
      .select(`
        *,
        users!inner(
          name
        )
      `)
      .eq("patient_id", patient.id)
      .order("date", { ascending: false });

    if (error) {
      console.error("[DOCTOR RECORDS] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const formattedRecords = records.map(record => ({
      id: record.id,
      date: record.date,
      tooth: record.tooth_number,
      procedure: record.procedure,
      status: record.status,
      doctorName: record.users.name,
    }));

    res.json({
      ok: true,
      records: formattedRecords
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR RECORDS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Get patient photos
app.get("/api/doctor/treatment/:patientId/photos", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;
    const { patientId } = req.params;

    // Get patient info first to verify access
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get photos
    const { data: photos, error } = await supabase
      .from("patient_photos")
      .select("*")
      .eq("patient_id", patient.id)
      .order("date", { ascending: false });

    if (error) {
      console.error("[DOCTOR PHOTOS] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const formattedPhotos = photos.map(photo => ({
      id: photo.id,
      url: photo.url,
      type: photo.type,
      date: photo.date,
      notes: photo.notes,
      quality: photo.quality,
      linkedTooth: photo.linked_tooth,
    }));

    res.json({
      ok: true,
      photos: formattedPhotos
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR PHOTOS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Complete procedure
app.put("/api/doctor/treatment/procedure/:procedureId/complete", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;
    const { procedureId } = req.params;

    // Get procedure info to verify access
    const { data: procedure, error: procError } = await supabase
      .from("teeth")
      .select(`
        *,
        patients!inner(
          clinic_id
        )
      `)
      .eq("id", procedureId)
      .single();

    if (procError || !procedure) {
      return res.status(404).json({ ok: false, error: "procedure_not_found" });
    }

    if (procedure.patients.clinic_id !== clinicId) {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    // Update procedure status to completed
    const { error: updateError } = await supabase
      .from("teeth")
      .update({
        status: "COMPLETED",
        completed_date: new Date().toISOString(),
      })
      .eq("id", procedureId);

    if (updateError) {
      console.error("[COMPLETE PROCEDURE] Error:", updateError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    // Add treatment record
    const { error: recordError } = await supabase
      .from("treatment_records")
      .insert({
        patient_id: procedure.name,
        tooth_number: procedure.fdi_number,
        procedure: procedure.procedures?.[0]?.type || "İşlem",
        status: "COMPLETED",
        date: new Date().toISOString(),
        doctor_id: v.decoded.patientId, // Using patientId as doctor ID
      });

    if (recordError) {
      console.error("[COMPLETE PROCEDURE] Record error:", recordError);
      // Don't fail the request if record creation fails
    }

    res.json({
      ok: true,
      message: "Procedure completed successfully"
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[COMPLETE PROCEDURE] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ICD-10 DIAGNOSIS CRUD (DOCTOR ONLY) ================= */

// Add diagnosis to tooth
app.post("/api/doctor/treatment/:patientId/tooth/:toothNumber/diagnosis", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, patientId: doctorId } = v.decoded;
    const { patientId, toothNumber } = req.params;
    const { diagnosisCode, description } = req.body || {};

    // Doctor cannot access their own treatment data
    if (checkDoctorSelfAccess(doctorId, patientId)) {
      return res.status(403).json({ ok: false, error: "self_access_denied" });
    }

    // Validation
    if (!diagnosisCode || !description) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    // Get patient info first to verify access
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get or create tooth record
    let { data: tooth, error: toothError } = await supabase
      .from("teeth")
      .select("*")
      .eq("patient_id", patient.id)
      .eq("fdi_number", toothNumber)
      .single();

    if (toothError && toothError.code === 'PGRST116') {
      // Tooth doesn't exist, create it
      const { data: newTooth, error: createError } = await supabase
        .from("teeth")
        .insert({
          patient_id: patient.id,
          fdi_number: toothNumber,
          status: "PLANNED",
          diagnosis: [{ code: diagnosisCode, description }],
        })
        .select()
        .single();

      if (createError) {
        console.error("[ADD DIAGNOSIS] Error:", createError);
        return res.status(500).json({ ok: false, error: "internal_error" });
      }

      return res.json({
        ok: true,
        message: "Diagnosis added successfully",
        tooth: newTooth
      });
    }

    if (toothError) {
      console.error("[ADD DIAGNOSIS] Error:", toothError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    // Add diagnosis to existing tooth
    const currentDiagnosis = tooth.diagnosis || [];
    const updatedDiagnosis = [...currentDiagnosis, { code: diagnosisCode, description }];

    const { data: updatedTooth, error: updateError } = await supabase
      .from("teeth")
      .update({
        diagnosis: updatedDiagnosis,
        status: "PLANNED", // Update status if diagnosis added
      })
      .eq("id", tooth.id)
      .select()
      .single();

    if (updateError) {
      console.error("[ADD DIAGNOSIS] Error:", updateError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({
      ok: true,
      message: "Diagnosis added successfully",
      tooth: updatedTooth
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADD DIAGNOSIS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Update diagnosis
app.put("/api/doctor/treatment/:patientId/tooth/:toothNumber/diagnosis/:diagnosisIndex", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, patientId: doctorId } = v.decoded;
    const { patientId, toothNumber, diagnosisIndex } = req.params;
    const { diagnosisCode, description } = req.body || {};

    // Doctor cannot access their own treatment data
    if (checkDoctorSelfAccess(doctorId, patientId)) {
      return res.status(403).json({ ok: false, error: "self_access_denied" });
    }

    // Validation
    if (!diagnosisCode || !description) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    // Get patient info first to verify access
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get tooth record
    const { data: tooth, error: toothError } = await supabase
      .from("teeth")
      .select("*")
      .eq("patient_id", patient.id)
      .eq("fdi_number", toothNumber)
      .single();

    if (toothError || !tooth) {
      return res.status(404).json({ ok: false, error: "tooth_not_found" });
    }

    const currentDiagnosis = tooth.diagnosis || [];
    const index = parseInt(diagnosisIndex);

    if (index < 0 || index >= currentDiagnosis.length) {
      return res.status(400).json({ ok: false, error: "invalid_diagnosis_index" });
    }

    // Update diagnosis
    currentDiagnosis[index] = { code: diagnosisCode, description };

    const { data: updatedTooth, error: updateError } = await supabase
      .from("teeth")
      .update({ diagnosis: currentDiagnosis })
      .eq("id", tooth.id)
      .select()
      .single();

    if (updateError) {
      console.error("[UPDATE DIAGNOSIS] Error:", updateError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({
      ok: true,
      message: "Diagnosis updated successfully",
      tooth: updatedTooth
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[UPDATE DIAGNOSIS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Delete diagnosis
app.delete("/api/doctor/treatment/:patientId/tooth/:toothNumber/diagnosis/:diagnosisIndex", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, patientId: doctorId } = v.decoded;
    const { patientId, toothNumber, diagnosisIndex } = req.params;

    // Doctor cannot access their own treatment data
    if (checkDoctorSelfAccess(doctorId, patientId)) {
      return res.status(403).json({ ok: false, error: "self_access_denied" });
    }

    // Get patient info first to verify access
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get tooth record
    const { data: tooth, error: toothError } = await supabase
      .from("teeth")
      .select("*")
      .eq("patient_id", patient.id)
      .eq("fdi_number", toothNumber)
      .single();

    if (toothError || !tooth) {
      return res.status(404).json({ ok: false, error: "tooth_not_found" });
    }

    const currentDiagnosis = tooth.diagnosis || [];
    const index = parseInt(diagnosisIndex);

    if (index < 0 || index >= currentDiagnosis.length) {
      return res.status(400).json({ ok: false, error: "invalid_diagnosis_index" });
    }

    // Remove diagnosis
    currentDiagnosis.splice(index, 1);

    const { data: updatedTooth, error: updateError } = await supabase
      .from("teeth")
      .update({ diagnosis: currentDiagnosis })
      .eq("id", tooth.id)
      .select()
      .single();

    if (updateError) {
      console.error("[DELETE DIAGNOSIS] Error:", updateError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({
      ok: true,
      message: "Diagnosis deleted successfully",
      tooth: updatedTooth
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DELETE DIAGNOSIS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= UPDATE PATIENT ROLE ================= */
app.put("/api/patient/role", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const { patientId, clinicId } = decoded;
    const { newRole } = req.body || {};

    // Validate role
    if (!newRole || !["PATIENT", "DOCTOR", "ADMIN"].includes(newRole)) {
      return res.status(400).json({ ok: false, error: "invalid_role" });
    }

    // Update patient role
    const { data: patient, error } = await supabase
      .from("patients")
      .update({ role: newRole })
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .select()
      .single();

    if (error) {
      console.error("[UPDATE ROLE] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Create new token with updated role
    const updatedToken = jwt.sign(
      { 
        patientId: patient.name, 
        clinicId: clinicId,
        clinicCode: patient.clinic_code || "",
        role: newRole,
        roleType: newRole
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      ok: true,
      message: "Role updated successfully",
      patientId: patient.name,
      name: patient.name,
      role: newRole,
      status: patient.status,
      token: updatedToken,
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[UPDATE ROLE] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR REGISTRATION ================= */
app.post("/api/register/doctor", async (req, res) => {
  try {
    const {
      clinicCode,
      phone,
      name,
      email,
      licenseNumber,
      department,
      specialties,
    } = req.body || {};

    if (!clinicCode || !phone || !name) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    // 1️⃣ Clinic check
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, clinic_code")
      .eq("clinic_code", clinicCode.trim())
      .single();

    if (clinicError || !clinic) {
      return res.status(400).json({
        ok: false,
        error: "invalid_clinic_code"
      });
    }

    // 2️⃣ Insert into DOCTORS table
    const doctorPayload = {
      id: crypto.randomUUID(),
      doctor_id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      clinic_id: clinic.id,
      clinic_code: clinic.clinic_code,
      full_name: name,
      email: email?.trim() || null,
      phone: phone.trim(),
      license_number: licenseNumber || "DEFAULT_LICENSE",
      department: department || null,
      specialties: specialties || null,
      status: "PENDING",
      role: "DOCTOR",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: insertedDoctor, error: insertError } = await supabase
      .from("doctors")
      .insert(doctorPayload)
      .select()
      .single();

    if (insertError) {
      console.error("[DOCTOR REGISTER] Insert error:", insertError);
      return res.status(500).json({
        ok: false,
        error: "registration_failed",
        details: insertError.message
      });
    }

    res.json({
      ok: true,
      message: "Doctor registration successful. Awaiting admin approval.",
      doctorId: insertedDoctor.doctor_id,
      status: insertedDoctor.status
    });

  } catch (err) {
    console.error("[DOCTOR REGISTER] Fatal error:", err);
    res.status(500).json({ ok: false, error: "registration_failed" });
  }
});

/* ================= TEST ENDPOINT ================= */
app.post("/api/test-register", async (req, res) => {
  console.log("[TEST] Full request body:", JSON.stringify(req.body, null, 2));
  res.json({ ok: true, received: req.body });
});

/* ================= PATIENT REGISTRATION ================= */
app.post("/api/register/patient", async (req, res) => {
  try {
    const {
      clinicCode,
      phone,
      patientName,
      email,
      userType = "PATIENT", // Force to PATIENT
      inviterReferralCode,
    } = req.body || {};

    console.log("[PATIENT REGISTER] Full request body:", JSON.stringify(req.body, null, 2));
    console.log("[PATIENT REGISTER] Parsed fields:", {
      clinicCode,
      phone,
      patientName,
      email,
      userType,
      inviterReferralCode,
    });

    // Validation
    console.log("[PATIENT REGISTER] Validation check:", {
      hasClinicCode: !!clinicCode,
      hasPhone: !!phone,
      hasPatientName: !!patientName,
      clinicCode: clinicCode,
      phone: phone,
      patientName: patientName
    });
    
    if (!clinicCode || !phone || !patientName) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_required_fields",
        details: {
          clinicCode: !!clinicCode,
          phone: !!phone,
          patientName: !!patientName
        }
      });
    }

    // Check clinic
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("*")
      .eq("clinic_code", clinicCode.trim())
      .single();

    if (clinicError || !clinic) {
      return res.status(400).json({
        ok: false,
        error: "invalid_clinic",
        message: "Geçersiz klinik kodu"
      });
    }

    // Check clinic limits
    const { data: existingPatients, error: countError } = await supabase
      .from("patients")
      .select("patient_id")
      .eq("clinic_code", clinicCode.trim());

    if (countError) {
      console.error("[PATIENT REGISTER] Count error:", countError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const patientCount = existingPatients?.length || 0;
    // Remove max patients check since clinics table doesn't have max_patients column

    // Generate patient ID
    const patient_id = generatePatientIdFromName(patientName);
    const referral_code = generateReferralCode();

    // Create patient with ACTIVE status
    console.log("[PATIENT REGISTER] Creating patient in table PATIENTS with role:", "PATIENT");
    
    const newPatient = {
      patient_id,
      name: patientName,
      phone: phone.trim(),
      email: email?.trim() || '',
      clinic_code: clinicCode.trim(),
      referral_code,
      status: "ACTIVE", // Patients are immediately ACTIVE
      role: "PATIENT", // Explicitly set role
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log("[PATIENT REGISTER] Patient payload:", JSON.stringify(newPatient, null, 2));

    const { data: insertedPatient, error: insertError } = await supabase
      .from("patients")
      .insert(newPatient)
      .select()
      .single();

    if (insertError) {
      console.error("[PATIENT REGISTER] Insert error:", insertError);
      return res.status(500).json({
        ok: false,
        error: "registration_failed",
        message: err.message || "Doktor kaydı başarısız oldu."
      });
    }

    // Handle referrals
    if (inviterReferralCode) {
      try {
        const { data: referrer } = await supabase
          .from("patients")
          .select("patient_id")
          .eq("referral_code", inviterReferralCode)
          .single();

        if (referrer) {
          await supabase.from("referrals").insert({
            referrer_id: referrer.name,
            referred_id: name,
            referral_code: inviterReferralCode,
            status: "pending",
          });
        }
      } catch (referralError) {
        console.error("[PATIENT REGISTER] Referral error:", referralError);
      }
    }

    // Create JWT token for patient
    const patientToken = jwt.sign(
      { 
        patientId: name, 
        clinicId: clinic.id,
        clinicCode: clinicCode.trim(),
        role: "PATIENT",
        roleType: "PATIENT"
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    console.log("[PATIENT REGISTER] Patient registered successfully:", {
      name,
      name: patientName,
      role: "PATIENT",
      status: "ACTIVE"
    });

    res.json({
      ok: true,
      message: "Patient registration successful.",
      patientId: name,
      referralCode: referral_code,
      name: patientName,
      phone: phone,
      email: email,
      status: "ACTIVE",
      role: "PATIENT",
      token: patientToken,
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[PATIENT REGISTER] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= CLEAR DOCTOR FOR TESTING ================= */
app.post("/api/admin/clear-doctor", adminAuth, async (req, res) => {
  try {
    const { email } = req.body || {};
    
    if (!email) {
      return res.status(400).json({ ok: false, error: "email_required" });
    }

    console.log("[CLEAR DOCTOR] Removing doctor with email:", email);

    const { error } = await supabase
      .from("patients")
      .delete()
      .eq("email", email.trim())
      .eq("role", "DOCTOR");

    if (error) {
      console.error("[CLEAR DOCTOR] Error:", error);
      return res.status(500).json({ ok: false, error: "delete_failed", details: error.message });
    }

    console.log("[CLEAR DOCTOR] Doctor removed successfully");
    res.json({
      ok: true,
      message: "Doctor removed successfully. You can now register with same email."
    });

  } catch (err) {
    console.error("[CLEAR DOCTOR] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR PROFILE ================= */
// GET /api/doctor/me - Fetch current doctor profile
app.get("/api/doctor/me", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, doctorId } = v.decoded;

    // Fetch doctor from patients table
    const { data: doctor, error } = await supabase
      .from("patients")
      .select(`
        id,
        patient_id,
        name,
        email,
        phone,
        department,
        title,
        experience_years,
        languages,
        specialties,
        status,
        clinic_id,
        clinic_code,
        license_number,
        role
      `)
      .eq("role", "DOCTOR")
      .eq("clinic_id", clinicId)
      .eq("id", doctorId)
      .single();

    if (error || !doctor) {
      console.error("[DOCTOR PROFILE ME] Error:", error);
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    res.json({
      ok: true,
      doctor: {
        doctorId: doctor.id,
        name: doctor.name,
        email: doctor.email,
        phone: doctor.phone,
        department: doctor.department,
        title: doctor.title,
        experience_years: doctor.experience_years,
        languages: doctor.languages,
        specialties: doctor.specialties,
        status: doctor.status,
        clinic_code: doctor.clinic_code
      }
    });
  } catch (err) {
    console.error("[DOCTOR PROFILE ME] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// PUT /api/doctor/me - Update current doctor profile
app.put("/api/doctor/me", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, patientId } = v.decoded;
    
    // Only allow updating specific fields
    const {
      name,
      phone,
      department,
      title,
      experience_years,
      languages,
      specialties
    } = req.body || {};

    // Build update payload with only allowed fields
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name;
    if (phone !== undefined) updatePayload.phone = phone;
    if (department !== undefined) updatePayload.department = department;
    if (title !== undefined) updatePayload.title = title;
    if (experience_years !== undefined) updatePayload.experience_years = experience_years;
    if (languages !== undefined) updatePayload.languages = languages;
    if (specialties !== undefined) updatePayload.specialties = specialties;

    // Update doctor in patients table
    const { data: doctor, error } = await supabase
      .from("patients")
      .update(updatePayload)
      .eq("role", "DOCTOR")
      .eq("clinic_id", clinicId)
      .eq("name", patientId)
      .select()
      .single();

    if (error) {
      console.error("[DOCTOR PROFILE ME UPDATE] Error:", error);
      return res.status(500).json({ ok: false, error: "update_failed" });
    }

    if (!doctor) {
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[DOCTOR PROFILE ME UPDATE] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN DOCTOR APPROVAL ================= */
app.post("/api/admin/approve-doctor", adminAuth, async (req, res) => {
  try {
    const { doctorId } = req.body || {};

    if (!doctorId) {
      return res.status(400).json({ ok: false, error: "doctorId_required" });
    }

    // 🔥 CRITICAL: Update doctor status in patients table (not doctors table)
    const { data: updatedDoctor, error: updateError } = await supabase
      .from("patients")
      .update({ status: "ACTIVE" })
      .eq("patient_id", doctorId)
      .select()
      .single();

    if (updateError) {
      console.error("[DOCTOR APPROVAL] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "approval_failed" });
    }

    if (!updatedDoctor) {
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    console.log("[DOCTOR APPROVAL] Doctor approved:", updatedDoctor.name);

    res.json({
      ok: true,
      doctorId: updatedDoctor.patient_id,
      status: updatedDoctor.status,
      message: "Doctor approved successfully",
    });
  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR APPROVAL] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENT TREATMENT GROUP ================= */
app.get("/api/admin/patients/:patientId/treatment-group", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    console.log("[ADMIN PATIENT TREATMENT GROUP] Request:", { patientId });

    // Get patient's treatment group assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from("patient_group_assignments")
      .select(`
        treatment_group_id,
        treatment_groups!inner(
          id,
          name,
          description,
          status,
          created_at
        )
      `)
      .eq("patient_id", patientId)
      .eq("treatment_groups.clinic_id", req.admin.clinicId)
      .single();

    if (assignmentError && assignmentError.code !== 'PGRST116') {
      console.error("[ADMIN PATIENT TREATMENT GROUP] Assignment error:", assignmentError);
      return res.status(500).json({ ok: false, error: "assignment_check_failed" });
    }

    if (!assignment) {
      return res.json({ ok: true, treatmentGroup: null });
    }

    // Get group members
    const { data: members, error: membersError } = await supabase
      .from("treatment_group_members")
      .select(`
        doctor_id,
        is_primary,
        patients!inner(
          id,
          name,
          department
        )
      `)
      .eq("treatment_group_id", assignment.treatment_group_id)
      .eq("patients.clinic_id", req.admin.clinicId);

    if (membersError) {
      console.error("[ADMIN PATIENT TREATMENT GROUP] Members error:", membersError);
      return res.status(500).json({ ok: false, error: "members_check_failed" });
    }

    const treatmentGroup = {
      ...assignment.treatment_groups,
      members: members ? members.map(member => ({
        doctor_id: member.doctor_id,
        doctor_name: member.patients.name,
        department: member.patients.department,
        is_primary: member.is_primary
      })) : []
    };

    console.log("[ADMIN PATIENT TREATMENT GROUP] Success:", {
      patientId,
      groupId: treatmentGroup.id,
      memberCount: treatmentGroup.members.length
    });

    res.json({
      ok: true,
      treatmentGroup
    });

  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN PATIENT TREATMENT GROUP] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TASK ASSIGNMENT ================= */
app.post("/api/admin/tasks", adminAuth, async (req, res) => {
  try {
    const {
      treatment_group_id,
      patient_id,
      assigned_doctor_id,
      title,
      description,
      priority = "medium",
      due_date
    } = req.body;

    if (!treatment_group_id || !patient_id || !assigned_doctor_id || !title) {
      return res.status(400).json({ ok: false, error: "required_fields_missing" });
    }

    const clinicId = req.admin.clinicId;

    // 1. Verify treatment group exists and belongs to admin's clinic
    const { data: treatmentGroup, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id, clinic_id, status")
      .eq("id", treatment_group_id)
      .eq("clinic_id", clinicId)
      .single();

    if (groupError || !treatmentGroup) {
      console.error("[ADMIN CREATE TASK] Treatment group not found:", groupError);
      return res.status(404).json({ ok: false, error: "treatment_group_not_found" });
    }

    // 2. Verify patient exists and belongs to same clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, clinic_id, status")
      .eq("id", patient_id)
      .eq("clinic_id", clinicId)
      .single();

    if (patientError || !patient) {
      console.error("[ADMIN CREATE TASK] Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // 3. Verify doctor exists, is active, belongs to same clinic, and is member of treatment group
    const { data: doctor, error: doctorError } = await supabase
      .from("doctors")
      .select("id, clinic_id, status, role")
      .eq("id", assigned_doctor_id)
      .eq("clinic_id", clinicId)
      .eq("role", "DOCTOR")
      .eq("status", "ACTIVE")
      .single();

    if (doctorError || !doctor) {
      console.error("[ADMIN CREATE TASK] Doctor not found:", doctorError);
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    // 4. Verify doctor is member of the treatment group
    const { data: groupMember, error: memberError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", treatment_group_id)
      .eq("doctor_id", assigned_doctor_id)
      .single();

    if (memberError || !groupMember) {
      console.error("[ADMIN CREATE TASK] Doctor not in treatment group:", memberError);
      return res.status(400).json({ ok: false, error: "doctor_not_in_treatment_group" });
    }

    // 5. Create the task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        treatment_group_id,
        patient_id,
        assigned_doctor_id,
        created_by_admin_id: req.admin.adminId,
        title,
        description,
        priority,
        due_date: due_date ? new Date(due_date).toISOString() : null
      })
      .select()
      .single();

    if (taskError || !task) {
      console.error("[ADMIN CREATE TASK] Task creation error:", taskError);
      return res.status(500).json({ ok: false, error: "task_creation_failed" });
    }

    console.log("[ADMIN CREATE TASK] Success:", {
      taskId: task.id,
      treatmentGroupId: treatment_group_id,
      patientId: patient_id,
      assignedDoctorId: assigned_doctor_id,
      adminId: req.admin.adminId
    });

    res.json({
      ok: true,
      task: {
        id: task.id,
        treatment_group_id: task.treatment_group_id,
        patient_id: task.patient_id,
        assigned_doctor_id: task.assigned_doctor_id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        created_at: task.created_at,
        updated_at: task.updated_at
      }
    });

  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN CREATE TASK] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR TASKS ================= */
app.get("/api/doctor/tasks", verifyDoctorToken, async (req, res) => {
  try {
    const { clinicId, doctorId } = req.doctor;

    // Get doctor's tasks with patient and treatment group info
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        completed_at,
        created_at,
        updated_at,
        treatment_group_id,
        patient_id,
        assigned_doctor_id,
        treatment_groups!inner(
          id,
          name,
          status,
          clinic_id
        ),
        patients!inner(
          id,
          name,
          patient_id,
          phone,
          status
        )
      `)
      .eq("assigned_doctor_id", doctorId)
      .eq("treatment_groups.clinic_id", clinicId)
      .order("created_at", { ascending: false });

    if (tasksError) {
      console.error("[DOCTOR TASKS] Error:", tasksError);
      return res.status(500).json({ ok: false, error: "tasks_fetch_failed" });
    }

    // Format tasks for response
    const formattedTasks = (tasks || []).map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      completed_at: task.completed_at,
      created_at: task.created_at,
      updated_at: task.updated_at,
      treatment_group: {
        id: task.treatment_groups.id,
        name: task.treatment_groups.name,
        status: task.treatment_groups.status
      },
      patient: {
        id: task.patients.id,
        name: task.patients.name,
        patient_id: task.patients.patient_id,
        phone: task.patients.phone,
        status: task.patients.status
      }
    }));

    console.log("[DOCTOR TASKS] Success:", {
      doctorId,
      taskCount: formattedTasks.length
    });

    res.json({
      ok: true,
      tasks: formattedTasks
    });

  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR TASKS] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR UPDATE TASK STATUS ================= */
app.patch("/api/doctor/tasks/:taskId", verifyDoctorToken, async (req, res) => {
  try {
    const { clinicId, doctorId } = req.doctor;
    const { taskId } = req.params;
    const { status } = req.body;

    if (!status || !['open', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }

    // Verify task exists and belongs to this doctor
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select(`
        id,
        assigned_doctor_id,
        status,
        treatment_groups!inner(
          clinic_id
        )
      `)
      .eq("id", taskId)
      .eq("assigned_doctor_id", doctorId)
      .eq("treatment_groups.clinic_id", clinicId)
      .single();

    if (taskError || !task) {
      console.error("[DOCTOR UPDATE TASK] Task not found:", taskError);
      return res.status(404).json({ ok: false, error: "task_not_found" });
    }

    // Update task status
    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", taskId)
      .eq("assigned_doctor_id", doctorId)
      .select()
      .single();

    if (updateError || !updatedTask) {
      console.error("[DOCTOR UPDATE TASK] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "task_update_failed" });
    }

    console.log("[DOCTOR UPDATE TASK] Success:", {
      taskId,
      doctorId,
      oldStatus: task.status,
      newStatus: status
    });

    res.json({
      ok: true,
      task: {
        id: updatedTask.id,
        status: updatedTask.status,
        updated_at: updatedTask.updated_at,
        completed_at: updatedTask.completed_at
      }
    });

  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR UPDATE TASK] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN FIND TEST DATA ================= */
app.get("/api/admin/find-test-data", async (req, res) => {
  try {
    // Find patients
    const { data: patients, error: patientError } = await supabase
      .from("patients")
      .select("id, patient_id, name, role, status, clinic_id")
      .eq("clinic_id", 1)
      .limit(5);

    // Find doctors
    const { data: doctors, error: doctorError } = await supabase
      .from("patients")
      .select("id, patient_id, name, role, status, clinic_id")
      .eq("clinic_id", 1)
      .eq("role", "DOCTOR")
      .eq("status", "ACTIVE")
      .limit(5);

    res.json({
      ok: true,
      patients: patients || [],
      doctors: doctors || [],
      errors: {
        patientError: patientError?.message,
        doctorError: doctorError?.message
      }
    });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

/* ================= ADMIN ASSIGN PATIENT (TREATMENT GROUP) ================= */
app.post("/api/admin/assign-patient", adminAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id } = req.body || {};

    if (!patient_id || !doctor_id) {
      return res.status(400).json({ ok: false, error: "patient_id_and_doctor_id_required" });
    }

    const clinicId = req.admin?.clinicId;
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_not_found" });
    }

    console.log("[ADMIN ASSIGN PATIENT] Request:", { patient_id, doctor_id, clinicId });

    // 1. Check if patient exists and belongs to same clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, patient_id, name, clinic_id, status")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patient_id)
      .single();

    if (patientError || !patient) {
      console.error("[ADMIN ASSIGN PATIENT] Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // 2. Check if doctor exists and belongs to same clinic
    const { data: doctor, error: doctorError } = await supabase
      .from("doctors")
      .select("id, doctor_id, name, clinic_id, status")
      .eq("clinic_id", clinicId)
      .eq("doctor_id", doctor_id)
      .single();

    if (doctorError || !doctor) {
      console.error("[ADMIN ASSIGN PATIENT] Doctor not found:", doctorError);
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    // 3. Create treatment group if not exists
    let treatmentGroupId;
    const { data: existingGroup, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id")
      .eq("patient_id", patient.id)
      .eq("clinic_id", clinicId)
      .eq("status", "ACTIVE")
      .single();

    if (groupError && groupError.code !== 'PGRST116') {
      console.error("[ADMIN ASSIGN PATIENT] Group check error:", groupError);
      return res.status(500).json({ ok: false, error: "group_check_failed" });
    }

    if (existingGroup) {
      treatmentGroupId = existingGroup.id;
      console.log("[ADMIN ASSIGN PATIENT] Using existing group:", treatmentGroupId);
    } else {
      // Create new treatment group
      const { data: newGroup, error: createGroupError } = await supabase
        .from("treatment_groups")
        .insert({
          patient_id: patient.id,
          clinic_id: clinicId,
          status: "ACTIVE",
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (createGroupError || !newGroup) {
        console.error("[ADMIN ASSIGN PATIENT] Group creation failed:", createGroupError);
        return res.status(500).json({ ok: false, error: "group_creation_failed" });
      }

      treatmentGroupId = newGroup.id;
      console.log("[ADMIN ASSIGN PATIENT] Created new group:", treatmentGroupId);
    }

    // 4. Add doctor to treatment group as primary member
    const { error: memberError } = await supabase
      .from("treatment_group_members")
      .upsert({
        treatment_group_id: treatmentGroupId,
        doctor_id: doctor.id,
        role: "PRIMARY",
        status: "ACTIVE",
        joined_at: new Date().toISOString()
      }, {
        onConflict: "treatment_group_id,doctor_id"
      });

    if (memberError) {
      console.error("[ADMIN ASSIGN PATIENT] Member assignment failed:", memberError);
      return res.status(500).json({ ok: false, error: "member_assignment_failed" });
    }

    // 5. Create patient group assignment record
    const { error: assignmentError } = await supabase
      .from("patient_group_assignments")
      .insert({
        patient_id: patient.id,
        treatment_group_id: treatmentGroupId,
        clinic_id: clinicId,
        assigned_by: req.admin.adminId,
        assigned_at: new Date().toISOString(),
        status: "ACTIVE"
      });

    if (assignmentError) {
      console.error("[ADMIN ASSIGN PATIENT] Assignment record failed:", assignmentError);
      return res.status(500).json({ ok: false, error: "assignment_record_failed" });
    }

    console.log("[ADMIN ASSIGN PATIENT] Success:", { treatmentGroupId, patient_id, doctor_id });

    res.json({
      ok: true,
      treatment_group_id: treatmentGroupId,
      message: "Patient assigned to treatment group successfully"
    });

  } catch (error) {
    console.error("[ADMIN ASSIGN PATIENT] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR PATIENTS (TREATMENT GROUP) ================= */
app.get("/api/doctor/patients", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;

    // Get patients through treatment group members (not directly from patients table)
    const { data: groupMembers, error: memberError } = await supabase
      .from("treatment_group_members")
      .select(`
        treatment_group_id,
        treatment_groups!inner(
          id,
          patient_id,
          patients!inner(
            patient_id,
            name,
            status
          )
        )
      `)
      .eq("doctor_id", v.decoded.doctorId)
      .eq("treatment_groups.clinic_id", clinicId)
      .eq("status", "ACTIVE");

    if (memberError) {
      console.error("[DOCTOR PATIENTS] Error:", memberError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const patients = groupMembers.map(member => ({
      patient_id: member.treatment_groups.patients.patient_id,
      treatment_group_id: member.treatment_group_id,
      name: member.treatment_groups.patients.name,
      status: member.treatment_groups.patients.status
    }));

    res.json({
      ok: true,
      patients
    });

  } catch (error) {
    console.error("[DOCTOR PATIENTS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR ENCOUNTERS ================= */
app.post("/api/doctor/encounters", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId } = v.decoded;
    const { treatment_group_id, icd10_codes, notes } = req.body || {};

    if (!treatment_group_id) {
      return res.status(400).json({ ok: false, error: "treatment_group_id_required" });
    }

    if (!icd10_codes || icd10_codes.length === 0) {
      return res.status(400).json({ ok: false, error: "icd10_codes_required" });
    }

    // Check if doctor is member of this treatment group
    const { data: membership, error: membershipError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", treatment_group_id)
      .eq("doctor_id", v.decoded.doctorId)
      .eq("status", "ACTIVE")
      .single();

    if (membershipError || !membership) {
      return res.status(403).json({ ok: false, error: "not_group_member" });
    }

    // Check if treatment group belongs to same clinic
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("clinic_id")
      .eq("id", treatment_group_id)
      .single();

    if (groupError || !group || group.clinic_id !== clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_mismatch" });
    }

    // Create encounter record
    const { data: encounter, error: encounterError } = await supabase
      .from("encounters")
      .insert({
        treatment_group_id,
        doctor_id: v.decoded.doctorId,
        encounter_type: "INITIAL",
        icd10_codes,
        notes: notes || "Initial examination",
        clinic_id: clinicId,
        created_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (encounterError || !encounter) {
      console.error("[DOCTOR ENCOUNTERS] Error:", encounterError);
      return res.status(500).json({ ok: false, error: "encounter_creation_failed" });
    }

    res.json({
      ok: true,
      encounter_id: encounter.id,
      message: "Encounter created successfully"
    });

  } catch (error) {
    console.error("[DOCTOR ENCOUNTERS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENT DETAIL ================= */
app.get("/api/admin/patients/:patientId", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    // Fetch patient from patients table
    const { data: patient, error } = await supabase
      .from("patients")
      .select(`
        id,
        patient_id,
        name,
        email,
        phone,
        department,
        title,
        experience_years,
        languages,
        specialties,
        status,
        clinic_id,
        clinic_code,
        license_number,
        role,
        created_at,
        updated_at
      `)
      .eq("clinic_id", req.clinicId)
      .eq("patient_id", patientId)
      .single();

    if (error || !patient) {
      console.error("[ADMIN PATIENT DETAIL] Error:", error);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    res.json({
      ok: true,
      patient: patient
    });
  } catch (err) {
    console.error("[ADMIN PATIENT DETAIL] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN DOCTOR APPLICATIONS ================= */
// 🔥 CRITICAL: Use doctors table - NOT patients table
app.get("/api/admin/doctor-applications", adminAuth, async (req, res) => {
  try {
    console.log("[ADMIN DOCTOR APPLICATIONS] Request received");
    console.log("[ADMIN DOCTOR APPLICATIONS] Admin info:", req.admin);

    // 🔥 CRITICAL: Get doctors from doctors table - NOT patients table
    const { data: doctors, error } = await supabase
      .from("doctors")
      .select("*")
      .in("status", ["PENDING", "ACTIVE", "APPROVED"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[DOCTOR APPLICATIONS] Error:", error);
      return res.status(500).json({ ok: false, error: "fetch_failed" });
    }

    res.json({
      ok: true,
      doctors: doctors || [],
    });
  } catch (err) {
    console.error("[DOCTOR APPLICATIONS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN DOCTOR LIST ================= */
// 🔥 CRITICAL: Use doctors table - NOT patients table
app.get("/admin/doctor-list", adminAuth, async (req, res) => {
  try {
    console.log("[ADMIN DOCTOR LIST] Request received");
    console.log("[ADMIN DOCTOR LIST] Admin info:", req.admin);

    // 🔥 CRITICAL: Get doctors from doctors table - NOT patients table
    const { data: doctors, error } = await supabase
      .from("doctors")
      .select("*")
      .in("status", ["PENDING", "ACTIVE", "APPROVED"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[DOCTOR LIST] Error:", error);
      return res.status(500).json({ ok: false, error: "fetch_failed" });
    }

    res.json({
      ok: true,
      doctors: doctors || [],
    });
  } catch (err) {
    console.error("[DOCTOR LIST] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= STATIC SERVING ================= */
app.get("/api/admin/active-patients", adminAuth, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    // Check if admin
    if (decoded.role !== "ADMIN") {
      return res.status(403).json({ ok: false, error: "admin_required" });
    }

    // Get active patients
    const { data: patients, error } = await supabase
      .from("patients")
      .select("*")
      .eq("role", "PATIENT")
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ACTIVE PATIENTS] Error:", error);
      return res.status(500).json({ ok: false, error: "fetch_failed" });
    }

    res.json({
      ok: true,
      patients: patients || [],
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ACTIVE PATIENTS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ACCESS VERIFY ================= */
app.post("/api/access/verify", async (req, res) => {
  try {
    const { token } = req.body || {};

    if (!token) {
      return res.status(400).json({ ok: false, error: "token_required" });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const patientId = decoded.patientId;
      const clinicId = decoded.clinicId;

      if (!patientId || !clinicId) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }

      // Patient bilgilerini Supabase'den al
      // patientId token'da TEXT formatında (örn: "p1"), Supabase'de patient_id kolonunda
      const { data: patient, error } = await supabase
        .from("patients")
        .select("status")
        .eq("patient_id", String(patientId))
        .eq("clinic_id", clinicId)
        .single();

      const status = patient?.status || decoded.role || "PENDING";

      res.json({
        ok: true,
        role: status,
        patientId: decoded.patientId,
        clinicCode: decoded.clinicCode,
      });
    } catch (jwtError) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Access verify error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= EVENTS (Analytics) ================= */
app.post("/api/events", async (req, res) => {
  try {
    const event = req.body || {};

    // Event'i Supabase events tablosuna kaydet
    // Token'dan clinic_id ve patient_id çıkar
    let clinicId = null;
    let patientIdUuid = null; // UUID version
    let patientIdText = null; // TEXT version (p3, p1, etc.)

    try {
      const authHeader = req.headers.authorization;
      const tokenHeader = req.headers["x-patient-token"];
      const token = authHeader?.startsWith("Bearer ") 
        ? authHeader.substring(7) 
        : tokenHeader;

      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        clinicId = decoded.clinicId;
        patientIdText = decoded.patientId; // TEXT version (p3, p1, etc.)

        // Eğer patientId varsa, UUID'sini bul
        if (patientIdText && clinicId) {
          const { data: patientData, error: patientError } = await supabase
            .from("patients")
            .select("id")
            .eq("patient_id", patientIdText)
            .eq("clinic_id", clinicId)
            .maybeSingle();

          if (!patientError && patientData) {
            patientIdUuid = patientData.id;
          }
        }
      }
    } catch (e) {
      // Token yoksa veya invalid ise, event'i clinic_id olmadan kaydet
      console.log("[EVENTS] Token verification failed or missing:", e?.message);
    }

    // Events tablosuna kaydet (sadece UUID varsa)
    if (clinicId && patientIdUuid) {
      await supabase.from("events").insert({
        clinic_id: clinicId,
        patient_id: patientIdUuid, // UUID kullan
        event_type: event.event_name || "unknown",
        data: event,
      }).then(({ error }) => {
        if (error) {
          console.error("[EVENTS] Supabase insert error:", error);
        } else {
          console.log("[EVENTS] Event saved successfully:", event.event_name || "unknown");
        }
      });
    } else if (clinicId) {
      // Clinic var ama patient UUID bulunamadı, sadece clinic_id ile kaydet
      console.log("[EVENTS] Patient UUID not found, saving with clinic_id only. patientIdText:", patientIdText);
      await supabase.from("events").insert({
        clinic_id: clinicId,
        patient_id: null,
        event_type: event.event_name || "unknown",
        data: event,
      }).then(({ error }) => {
        if (error) {
          console.error("[EVENTS] Supabase insert error (clinic only):", error);
        }
      });
    }

    // Her zaman success dön (analytics hataları uygulamayı etkilemesin)
    res.json({ ok: true, received: true });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    // Analytics hataları sessizce handle et
    console.error("[EVENTS] Error:", error);
    res.json({ ok: true, received: true }); // Her zaman success dön
  }
});

/* ================= PATIENT MESSAGES (GET) ================= */
// Hasta mesajlarını getir - APPROVED kontrolü ile
app.get("/api/patient/:patientId/messages", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  try {
    // Check if admin or patient token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const actorHeader = req.headers["x-actor"];
    const actor = actorHeader ? String(actorHeader).toLowerCase().trim() : "patient";
    const authToken = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    let decoded;
    let isAdmin = false;
    let clinicId;

    if (authToken) {
      try {
        decoded = jwt.verify(authToken, JWT_SECRET);
        const hasPatientId = decoded.patientId !== null && decoded.patientId !== undefined && String(decoded.patientId || "").trim() !== "";
        const hasClinicCode = decoded.clinicCode !== null && decoded.clinicCode !== undefined;
        const hasClinicId = decoded.clinicId !== null && decoded.clinicId !== undefined;
        isAdmin = actor === "admin" || (hasClinicCode && hasClinicId && !hasPatientId);
        clinicId = decoded.clinicId;
      } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
        console.log("Messages GET - Token verification failed:", error.message);
        // Token invalid, continue without auth (might be public endpoint)
      }
    } else {
      console.log("Messages GET - No auth token provided");
    }

    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id, status, clinic_id, role")
      .eq("patient_id", patientId)
      .maybeSingle();

    if (patientError || !patientData) {
      console.log("Messages GET - Patient not found:", patientError?.message);
      return res.json({ ok: true, messages: [] }); // Boş mesaj listesi döndür (404 yerine)
    }

    // 2. Token kontrolü - Patient için token zorunlu
    if (!isAdmin && !decoded) {
      console.log("Messages GET - No valid token for patient access");
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Authentication required" });
    }

    // 3. APPROVED kontrolü - Admin ve Doctor için bypass, patient için zorunlu
    if (!isAdmin && patientData.role !== "DOCTOR" && patientData.status !== "APPROVED") {
      return res.status(403).json({ ok: false, error: "CHAT_LOCKED", message: "Chat is only available after patient approval" });
    }

    // 4. Admin ise clinic kontrolü yap
    if (isAdmin && clinicId && patientData.clinic_id !== clinicId) {
      return res.status(403).json({ ok: false, error: "access_denied", message: "Cannot access chat from different clinic" });
    }

    // 5. Patient ise token'daki patientId ile eşleşmeli
    if (!isAdmin && decoded && decoded.patientId && decoded.patientId !== patientId) {
      console.log("Messages GET - Patient ID mismatch:", { tokenPatientId: decoded.patientId, requestPatientId: patientId });
      return res.status(403).json({ ok: false, error: "access_denied", message: "Cannot access other patient's chat" });
    }

    const patientUuid = patientData.id;

    // 2. patient_messages tablosundan mesajları çek
    const { data: messages, error: messagesError } = await supabase
      .from("patient_messages")
      .select("*")
      .eq("patient_id", patientUuid)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("Messages GET - Supabase error:", messagesError);
      return res.json({ ok: true, messages: [] }); // Boş mesaj listesi döndür
    }

    // 3. Mesajları frontend formatına dönüştür
    const formattedMessages = (messages || []).map((msg) => {
      // Attachment bilgisini normalize et (name ve size eksikse doldur)
      let attachment = msg.attachment || undefined;
      if (attachment && typeof attachment === 'object') {
        // Eğer attachment.name yoksa, URL'den çıkarmayı dene
        if (!attachment.name && attachment.url) {
          try {
            const urlParts = attachment.url.split('/');
            const fileName = urlParts[urlParts.length - 1];
            if (fileName && fileName.includes('.')) {
              // Query string'i temizle
              const cleanName = fileName.split('?')[0];
              attachment.name = decodeURIComponent(cleanName);
            }
          } catch (e) {
            // URL parse hatası - default isim kullan
            if (!attachment.name) {
              attachment.name = "Dosya";
            }
          }
        }
        // Eğer hala name yoksa, default değer
        if (!attachment.name) {
          attachment.name = "Dosya";
        }
        // Size varsa kullan, yoksa 0
        if (attachment.size === null || attachment.size === undefined) {
          attachment.size = 0;
        }
      }
      
      return {
        id: msg.message_id || msg.id,
        from: msg.from_role === "patient" || msg.from_role === "PATIENT" ? "PATIENT" : "CLINIC",
        text: msg.text || "",
        type: msg.type || "text",
        attachment: attachment,
        createdAt: msg.created_at ? new Date(msg.created_at).getTime() : Date.now(),
      };
    });

    // Debug: attachment bilgisi olan mesajları logla
    const attachmentMessages = formattedMessages.filter(m => m.attachment);
    if (attachmentMessages.length > 0) {
      console.log(`[Messages GET] Found ${attachmentMessages.length} messages with attachments for patient ${patientId}`);
      attachmentMessages.forEach((m, idx) => {
        console.log(`[Messages GET] Attachment ${idx + 1}:`, {
          id: m.id,
          name: m.attachment?.name,
          size: m.attachment?.size,
          url: m.attachment?.url ? m.attachment.url.substring(0, 50) + "..." : "no URL",
        });
      });
    }

    res.json({ ok: true, messages: formattedMessages });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Messages GET error:", error);
    res.json({ ok: true, messages: [] }); // Error durumunda boş liste döndür
  }
});

/* ================= PATIENT FILE UPLOAD (POST) ================= */
// Hasta dosya yükle (fotoğraf, PDF vb.) - ÖNCE BU ROUTE (daha spesifik)
app.post("/api/patient/:patientId/upload", upload.single("file"), async (req, res, next) => {
  // Multer hatalarını yakala (fileFilter'dan gelen hatalar)
  if (req.fileFilterError) {
    console.error("[Upload POST] File filter error:", req.fileFilterError);
    return res.status(400).json({ ok: false, error: "file_type_forbidden", message: req.fileFilterError.message });
  }
  
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  try {
    // 1. Patient token'ını doğrula
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const token = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error("Upload POST - JWT verification error:", jwtError);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tokenPatientId = decoded.patientId;
    const clinicId = decoded.clinicId;

    if (!tokenPatientId || !clinicId) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    // 2. URL'deki patientId ile token'daki patientId eşleşmeli
    if (tokenPatientId !== patientId) {
      console.error("Upload POST - Patient ID mismatch:", { urlPatientId: patientId, tokenPatientId });
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    // 3. Request detaylarını log'la
    console.log(`[Upload POST] Request received for patient ${patientId}`);
    console.log(`[Upload POST] Content-Type: ${req.headers["content-type"]}`);
    console.log(`[Upload POST] req.file:`, req.file ? "exists" : "missing");
    console.log(`[Upload POST] req.body:`, Object.keys(req.body || {}));
    console.log(`[Upload POST] req.files:`, req.files ? "exists" : "missing");

    // 3. Dosya kontrolü
    if (!req.file) {
      console.error("Upload POST - No file received in req.file");
      console.error("Upload POST - req.body:", JSON.stringify(req.body, null, 2));
      console.error("Upload POST - req.headers:", JSON.stringify(req.headers, null, 2));
      return res.status(400).json({ ok: false, error: "file_required", details: "No file received in multipart form" });
    }

    const file = req.file;
    console.log(`[Upload POST] Patient ${patientId} uploading file: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
    
    // 3.1. Dosya tipi kontrolü (ikinci kontrol - güvenlik için)
    // Dosya uzantısını al (sonra güncellenebilir olması için let kullanıyoruz)
    let fileExt = path.extname(file.originalname || '').toLowerCase();
    const forbiddenExtensions = [
      '.exe', '.app', '.deb', '.rpm', '.msi', '.dmg', '.pkg',
      '.bat', '.cmd', '.com', '.scr', '.vbs', '.ps1',
      '.js', '.jsx', '.ts', '.tsx', '.py', '.pyc', '.pyo',
      '.sh', '.bash', '.zsh', '.csh', '.fish',
      '.php', '.asp', '.aspx', '.jsp', '.rb', '.pl', '.pm',
      '.7z', '.tar', '.gz', '.bz2', // ZIP ve RAR hariç - izin veriliyor
      '.dll', '.so', '.dylib', '.sys', '.drv',
    ];
    
    if (forbiddenExtensions.includes(fileExt)) {
      console.error(`[Upload POST] Forbidden file extension rejected: ${fileExt}`);
      return res.status(400).json({ ok: false, error: "file_type_forbidden", message: `Dosya tipi yasak: ${fileExt}. Güvenlik nedeniyle bu dosya tipi yüklenemez.` });
    }

    // 4. Patient UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (patientError || !patientData) {
      console.error("Upload POST - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // 5. Dosya uzantısını kontrol et ve düzelt (eğer gerekirse MIME type'dan çıkar)
    // Eğer uzantı yoksa veya .bin ise MIME type'dan çıkar
    if (!fileExt || fileExt === '.bin') {
      const mimeToExt = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/heic': '.heic',
        'image/heif': '.heif',
        'application/pdf': '.pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'application/dicom': '.dcm',
        'application/x-dicom': '.dcm',
        'image/dicom': '.dcm',
        'application/zip': '.zip', // ZIP dosyaları
        'application/x-rar-compressed': '.rar', // RAR dosyaları
        'application/vnd.rar': '.rar',
        'application/x-rar': '.rar',
      };
      fileExt = mimeToExt[file.mimetype] || '.bin';
    }
    
    // Dosya adını oluştur (unique) - orijinal uzantıyı koru
    const fileName = `patient-${patientId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${fileExt}`;
    const filePath = `patient-uploads/${clinicId}/${fileName}`;

    // 6. Supabase Storage'a yükle
    console.log(`[Upload POST] Uploading to Supabase Storage bucket: ${SUPABASE_STORAGE_BUCKET}, path: ${filePath}`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false, // Don't overwrite existing files
      });

    if (uploadError) {
      console.error("Upload POST - Supabase storage error:", uploadError);
      console.error("Upload POST - Supabase storage error code:", uploadError.code);
      console.error("Upload POST - Supabase storage error message:", uploadError.message);
      console.error("Upload POST - Supabase storage error status:", uploadError.statusCode);
      console.error("Upload POST - Bucket name: patient-files");
      console.error("Upload POST - File path:", filePath);
      
      // Bucket not found hatası ise özel mesaj
      if (uploadError.message && (uploadError.message.includes("Bucket not found") || uploadError.message.includes("not found"))) {
        const errorMessage = `Supabase Storage bucket bulunamadı. Lütfen '${SUPABASE_STORAGE_BUCKET}' bucket'ını Supabase Dashboard'dan oluşturun ve public yapın.`;
        return res.status(500).json({ 
          ok: false, 
          error: "upload_failed", 
          message: errorMessage,
          details: uploadError.message,
          bucket: SUPABASE_STORAGE_BUCKET
        });
      }
      
      const errorMessage = uploadError.message || "Dosya yükleme hatası";
      return res.status(500).json({ 
        ok: false, 
        error: "upload_failed", 
        message: errorMessage,
        details: uploadError.message || errorMessage
      });
    }

    // 7. Public URL al
    const { data: urlData } = supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl || `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${filePath}`;

    // 8. Response döndür
    const response = {
      ok: true,
      file: {
        id: fileName,
        name: file.originalname,
        mime: file.mimetype,
        size: file.size,
        url: publicUrl,
      },
    };

    console.log("Upload POST - Success:", { patientId, fileName, url: publicUrl });
    res.json(response);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Upload POST error:", error);
    
    // Multer fileFilter hatası ise özel mesaj döndür
    if (error.message && (error.message.includes("Dosya tipi yasak") || error.message.includes("Dosya tipi desteklenmiyor"))) {
      return res.status(400).json({ ok: false, error: "file_type_forbidden", message: error.message });
    }
    
    res.status(500).json({ ok: false, error: "upload_exception", details: error.message });
  }
}, (err, req, res, next) => {
  // Multer error handler middleware
  if (err) {
    console.error("[Upload POST] Multer error:", err);
    if (err.message) {
      return res.status(400).json({ ok: false, error: "upload_failed", message: err.message });
    }
    return res.status(500).json({ ok: false, error: "upload_exception", details: err.message || "Unknown upload error" });
  }
  next();
});

/* ================= PATIENT MESSAGES (POST - Patient Send) ================= */
// Hasta mesaj gönder
app.post("/api/patient/:patientId/messages", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  try {
    // 1. Patient token'ını doğrula
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const token = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      console.error("Messages POST - JWT verification error:", jwtError);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tokenPatientId = decoded.patientId;
    const clinicId = decoded.clinicId;

    if (!tokenPatientId || !clinicId) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    // 2. URL'deki patientId ile token'daki patientId eşleşmeli
    if (tokenPatientId !== patientId) {
      console.error("Messages POST - Patient ID mismatch:", { urlPatientId: patientId, tokenPatientId });
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    // 3. Request body'yi al
    const body = req.body || {};
    const text = String(body.text || "").trim();
    const type = String(body.type || "text").trim();
    const attachment = body.attachment || undefined;

    if (!text && !attachment) {
      return res.status(400).json({ ok: false, error: "text_or_attachment_required" });
    }

    console.log(`[Messages POST] Patient ${patientId} sending message in clinic ${clinicId}`);

    // 4. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini ve status'unu al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id, status")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId) // Aynı clinic'ten olmalı
      .single();

    if (patientError || !patientData) {
      console.error("Messages POST - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // 5. APPROVED kontrolü - Chat sadece APPROVED hastalar ve Doctor'lar için
    if (patientData.role !== "DOCTOR" && patientData.status !== "APPROVED") {
      return res.status(403).json({ ok: false, error: "CHAT_LOCKED", message: "Chat is only available after patient approval" });
    }

    const patientUuid = patientData.id;

    // 6. Mesaj oluştur
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { data: newMessage, error: insertError } = await supabase
      .from("patient_messages")
      .insert({
        patient_id: patientUuid,
        message_id: messageId,
        chat_id: patientId,
        from_role: "patient",
        text: text || null,
        type: type || "text",
        attachment: attachment || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Messages POST - Supabase error:", insertError);
      return res.status(500).json({ ok: false, error: "message_send_failed", details: insertError.message });
    }

    const response = {
      ok: true,
      message: {
        id: newMessage.message_id || newMessage.id,
        from: "PATIENT",
        text: newMessage.text || "",
        type: newMessage.type || "text",
        attachment: newMessage.attachment || undefined,
        createdAt: newMessage.created_at ? new Date(newMessage.created_at).getTime() : Date.now(),
      },
    };

    console.log("Messages POST - Success (Admin):", { patientId, messageId });
    res.json(response);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Messages POST error (Admin):", error);
    res.status(500).json({ ok: false, error: "message_send_exception", details: error.message });
  }
});

/* ================= CHAT FILE UPLOAD (POST) ================= */
// Chat için dosya yükleme endpoint'i (Patient veya Admin)
// POST /api/chat/upload
app.post("/api/chat/upload", chatUpload.array("files", 5), async (req, res) => {
  // Multer hatalarını yakala
  if (req.fileFilterError) {
    console.error("[Chat Upload] File filter error:", req.fileFilterError);
    const errorMsg = req.fileFilterError.message || "";
    if (errorMsg.includes("INVALID_FILE_TYPE")) {
      return res.status(400).json({ ok: false, error: "INVALID_FILE_TYPE", message: errorMsg });
    }
    return res.status(400).json({ ok: false, error: "file_validation_failed", message: errorMsg });
  }

  const patientId = String(req.body.patientId || "").trim();
  if (!patientId) {
    return res.status(400).json({ ok: false, error: "patient_id_required" });
  }

  try {
    // 1. Auth token'ını doğrula (Patient veya Admin)
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const actorHeader = req.headers["x-actor"];
    const actor = actorHeader ? String(actorHeader).toLowerCase().trim() : "patient";
    const authToken = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!authToken) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    let isAdmin = false;
    let clinicId;
    let tokenPatientId;

    try {
      decoded = jwt.verify(authToken, JWT_SECRET);
      const hasPatientId = decoded.patientId !== null && decoded.patientId !== undefined && String(decoded.patientId || "").trim() !== "";
      const hasClinicCode = decoded.clinicCode !== null && decoded.clinicCode !== undefined;
      const hasClinicId = decoded.clinicId !== null && decoded.clinicId !== undefined;
      isAdmin = actor === "admin" || (hasClinicCode && hasClinicId && !hasPatientId);
      clinicId = decoded.clinicId;
      tokenPatientId = decoded.patientId;
    } catch (jwtError) {
      console.error("[Chat Upload] JWT verification error:", jwtError);
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    // 2. Patient kontrolü ve APPROVED kontrolü
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id, status, clinic_id")
      .eq("patient_id", patientId)
      .maybeSingle();

    if (patientError || !patientData) {
      console.error("[Chat Upload] Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // 3. APPROVED kontrolü - Chat sadece APPROVED hastalar ve Doctor'lar için
    if (patientData.role !== "DOCTOR" && patientData.status !== "APPROVED") {
      return res.status(403).json({ ok: false, error: "CHAT_LOCKED", message: "Chat is only available after patient approval" });
    }

    // 4. Auth kontrolü
    if (isAdmin) {
      // Admin ise clinic kontrolü
      if (patientData.clinic_id !== clinicId) {
        return res.status(403).json({ ok: false, error: "access_denied", message: "Cannot upload files to chat from different clinic" });
      }
    } else {
      // Patient ise patientId kontrolü
      if (tokenPatientId !== patientId) {
        return res.status(403).json({ ok: false, error: "access_denied", message: "Cannot upload files to other patient's chat" });
      }
    }

    // 5. Dosya kontrolü
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ ok: false, error: "files_required", message: "At least one file is required" });
    }

    if (files.length > 5) {
      return res.status(400).json({ ok: false, error: "too_many_files", message: "Maximum 5 files allowed per upload" });
    }

    const patientUuid = patientData.id;
    const uploadedFiles = [];

    // 6. Her dosyayı işle
    for (const file of files) {
      const fileExt = path.extname(file.originalname || '').toLowerCase();
      const isImageUpload = req.body.isImage === "true" || req.body.isImage === true;
      
      // Görsel upload için özel kurallar
      if (isImageUpload) {
        // Görsel format kontrolleri
        const allowedImageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
        const allowedImageExts = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
        const forbiddenImageMimes = ['image/svg+xml', 'image/gif', 'image/bmp', 'image/tiff', 'image/tif', 'image/x-raw', 'image/raw'];
        const forbiddenImageExts = ['.svg', '.gif', '.bmp', '.tiff', '.tif', '.raw', '.cr2', '.nef', '.orf', '.sr2'];
        
        // SVG kesinlikle engelle
        if (file.mimetype === 'image/svg+xml' || fileExt === '.svg') {
          return res.status(400).json({ ok: false, error: "INVALID_FILE_TYPE", message: "SVG formatı desteklenmiyor. Desteklenen formatlar: JPG, PNG, HEIC – Max 5MB" });
        }
        
        // Reddedilen formatları kontrol et
        if (forbiddenImageMimes.includes(file.mimetype) || forbiddenImageExts.includes(fileExt)) {
          return res.status(400).json({ ok: false, error: "INVALID_FILE_TYPE", message: "Format desteklenmiyor. Desteklenen formatlar: JPG, PNG, HEIC – Max 5MB" });
        }
        
        // Kabul edilen format kontrolü
        if (!allowedImageMimes.includes(file.mimetype) || !allowedImageExts.includes(fileExt)) {
          return res.status(400).json({ ok: false, error: "INVALID_FILE_TYPE", message: "Format desteklenmiyor. Desteklenen formatlar: JPG, PNG, HEIC – Max 5MB" });
        }
        
        // MIME type ve uzantı uyumu kontrolü
        const mimeToExt = {
          'image/jpeg': ['.jpg', '.jpeg'],
          'image/jpg': ['.jpg', '.jpeg'],
          'image/png': ['.png'],
          'image/heic': ['.heic'],
          'image/heif': ['.heif'],
        };
        
        const expectedExts = mimeToExt[file.mimetype];
        if (!expectedExts || !expectedExts.includes(fileExt)) {
          return res.status(400).json({ ok: false, error: "INVALID_FILE_TYPE", message: `Dosya uzantısı MIME tipiyle uyuşmuyor. Desteklenen formatlar: JPG, PNG, HEIC – Max 5MB` });
        }
        
        // Dosya boyutu kontrolü (5MB max, 10MB üstü kesin reddet)
        const maxSizeImage = 5 * 1024 * 1024; // 5MB
        const hardLimit = 10 * 1024 * 1024; // 10MB
        
        if (file.size > hardLimit) {
          return res.status(400).json({ ok: false, error: "FILE_TOO_LARGE", message: `Fotoğraf boyutu çok büyük: ${file.originalname}. Maksimum boyut: 5MB. Desteklenen formatlar: JPG, PNG, HEIC – Max 5MB` });
        }
        
        if (file.size > maxSizeImage) {
          return res.status(400).json({ ok: false, error: "FILE_TOO_LARGE", message: `Fotoğraf boyutu 5MB'dan küçük olmalıdır. Desteklenen formatlar: JPG, PNG, HEIC – Max 5MB` });
        }
        
        // Görsel işleme burada yapılacak (resize, normalize, EXIF temizleme - sharp gerektirir)
        // Şimdilik orijinal dosyayı kullanıyoruz, sharp eklendiğinde burada işlenecek
        // TODO: Sharp eklendiğinde:
        // 1. Resize (max uzun kenar 2000-2500px)
        // 2. JPEG'e normalize et (quality 80-85%)
        // 3. EXIF/konum bilgileri temizle
        // file.buffer = processedImageBuffer; // İşlenmiş görsel buffer'ı kullan
      }
      
      // Doküman upload için mevcut kontroller
      const maxSizeDocument = 15 * 1024 * 1024; // 15MB
      const isPDF = file.mimetype === "application/pdf";
      const isDOCX = file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const isZIP = file.mimetype === "application/zip" || file.mimetype === "application/x-zip-compressed";

      if ((isPDF || isDOCX || isZIP) && file.size > maxSizeDocument) {
        return res.status(400).json({ ok: false, error: "FILE_TOO_LARGE", message: `Document file too large: ${file.originalname}. Maximum size: 15MB` });
      }

      // Doküman uzantı kontrolü
      const docMimeToExt = {
        'application/pdf': ['.pdf'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'application/zip': ['.zip'],
        'application/x-zip-compressed': ['.zip'],
      };

      const expectedDocExts = docMimeToExt[file.mimetype];
      if (expectedDocExts && !expectedDocExts.includes(fileExt)) {
        console.error(`[Chat Upload] MIME type/extension mismatch: ${file.mimetype} vs ${fileExt}`);
        return res.status(400).json({ ok: false, error: "INVALID_FILE_TYPE", message: `File extension does not match MIME type: ${fileExt} / ${file.mimetype}` });
      }

      // UUID-based filename oluştur
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fileName = `${fileId}${fileExt}`;
      const filePath = `chat-files/${clinicId}/${patientId}/${fileName}`;

      // 7. Supabase Storage'a yükle (private bucket)
      console.log(`[Chat Upload] Uploading file to Supabase Storage: ${filePath}`);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("[Chat Upload] Supabase storage error:", uploadError);
        return res.status(500).json({ ok: false, error: "upload_failed", message: uploadError.message });
      }

      // 8. Signed URL oluştur (private file için)
      const { data: urlData, error: urlError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .createSignedUrl(filePath, 31536000); // 1 year expiry

      let fileUrl;
      if (urlError) {
        console.error("[Chat Upload] Signed URL creation error:", urlError);
        // Fallback: public URL oluşturmayı dene
        fileUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${filePath}`;
      } else {
        fileUrl = urlData?.signedUrl || `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${filePath}`;
      }

      const fileType = isImageUpload ? "image" : "pdf";

      // 9. Mesaj oluştur (dosya mesajı)
      // Note: Database constraint may require 'text' for type field
      // File type is stored in attachment.fileType
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const { data: newMessage, error: insertError } = await supabase
        .from("patient_messages")
        .insert({
          patient_id: patientUuid,
          message_id: messageId,
          chat_id: patientId,
          from_role: isAdmin ? "admin" : "patient",
          text: null,
          type: "text", // Database constraint requires 'text' - file type is stored in attachment.fileType
          attachment: {
            name: file.originalname,
            size: file.size,
            url: fileUrl,
            mimeType: file.mimetype,
            fileType: fileType,
          },
        })
        .select()
        .single();

      if (insertError) {
        console.error("[Chat Upload] Message insert error:", insertError);
        return res.status(500).json({ ok: false, error: "message_send_failed", details: insertError.message });
      }

      uploadedFiles.push({
        id: newMessage.message_id || newMessage.id,
        name: file.originalname,
        size: file.size,
        url: fileUrl,
        mimeType: file.mimetype,
        fileType: fileType,
        messageId: messageId,
      });
    }

    console.log(`[Chat Upload] Success: ${uploadedFiles.length} file(s) uploaded for patient ${patientId}`);
    res.json({ 
      ok: true, 
      files: uploadedFiles,
      message: uploadedFiles.length === 1 
        ? "File uploaded successfully" 
        : `${uploadedFiles.length} files uploaded successfully`
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[Chat Upload] Exception:", error);
    res.status(500).json({ ok: false, error: "upload_exception", details: error.message });
  }
}, (err, req, res, next) => {
  // Multer error handler middleware for chat upload
  if (err) {
    console.error("[Chat Upload] Multer error:", err);
    if (err.message && err.message.includes("INVALID_FILE_TYPE")) {
      return res.status(400).json({ ok: false, error: "INVALID_FILE_TYPE", message: err.message });
    }
    if (err.message && err.message.includes("FILE_TOO_LARGE")) {
      return res.status(400).json({ ok: false, error: "FILE_TOO_LARGE", message: err.message });
    }
    return res.status(400).json({ ok: false, error: "upload_failed", message: err.message || "Upload failed" });
  }
  next();
});

/* ================= PATIENT MESSAGES (POST - Admin Reply) ================= */
// Admin mesaj gönder
app.post("/api/patient/:patientId/messages/admin", adminAuth, async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  const body = req.body || {};
  const text = String(body.text || "").trim();
  const type = String(body.type || "text").trim();
  const attachment = body.attachment || undefined;
  
  if (!text && !attachment) {
    return res.status(400).json({ ok: false, error: "text_or_attachment_required" });
  }

  try {
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id, status")
      .eq("patient_id", patientId)
      .eq("clinic_id", req.clinicId) // Aynı clinic'ten olmalı
      .maybeSingle();

    if (patientError || !patientData) {
      console.error("Messages POST - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Admin için APPROVED kontrolü yap (admin ve doctor için bypass)
    if (patientData.role !== "DOCTOR" && patientData.status !== "APPROVED") {
      return res.status(403).json({ ok: false, error: "CHAT_LOCKED", message: "Chat is only available after patient approval" });
    }

    const patientUuid = patientData.id;

    // 2. Mesaj oluştur
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const { data: newMessage, error: insertError } = await supabase
      .from("patient_messages")
      .insert({
        patient_id: patientUuid,
        message_id: messageId,
        chat_id: patientId,
        from_role: "admin",
        text: text || null,
        type: type || "text",
        attachment: attachment || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Messages POST - Supabase error:", insertError);
      return res.status(500).json({ ok: false, error: "message_send_failed", details: insertError.message });
    }

    const response = {
      ok: true,
      message: {
        id: newMessage.message_id || newMessage.id,
        from: "CLINIC",
        text: newMessage.text || "",
        type: newMessage.type || "text",
        attachment: newMessage.attachment || undefined,
        createdAt: newMessage.created_at ? new Date(newMessage.created_at).getTime() : Date.now(),
      },
    };

    console.log("Messages POST - Success:", { patientId, messageId });
    res.json(response);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Messages POST error:", error);
    res.status(500).json({ ok: false, error: "message_send_exception", details: error.message });
  }
});

/* ================= PATIENT REFERRALS (GET) ================= */
// Hasta kendi referral'larını görüntüle
app.get("/api/patient/:patientId/referrals", async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    // Patient token'ını doğrula
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const token = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tokenPatientId = decoded.patientId;
    const clinicId = decoded.clinicId;

    if (tokenPatientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    // Patient UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (patientError || !patientData) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const patientUuid = patientData.id;

    // Bu hastanın referral'larını getir (hem inviter hem invited olarak)
    const { data: referrals, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("clinic_id", clinicId)
      .or(`inviter_patient_id.eq.${patientUuid},invited_patient_id.eq.${patientUuid}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Patient Referrals GET - Supabase error:", error);
      return res.status(500).json({ ok: false, error: "referrals_fetch_failed", details: error.message });
    }

    // Frontend formatına dönüştür
    const formattedReferrals = await Promise.all((referrals || []).map(async (ref) => {
      // Inviter patient_id'yi al
      let inviterPatientId = null;
      if (ref.inviter_patient_id) {
        const { data: inviterPatient } = await supabase
          .from("patients")
          .select("patient_id")
          .eq("id", ref.inviter_patient_id)
          .maybeSingle();
        inviterPatientId = inviterPatient?.patient_id || null;
      }
      
      // Invited patient_id'yi al
      let invitedPatientId = null;
      if (ref.invited_patient_id) {
        const { data: invitedPatient } = await supabase
          .from("patients")
          .select("patient_id")
          .eq("id", ref.invited_patient_id)
          .maybeSingle();
        invitedPatientId = invitedPatient?.patient_id || null;
      }
      
      return {
        id: ref.referral_id || ref.id,
        inviterPatientName: ref.inviter_patient_name || null,
        invitedPatientName: ref.invited_patient_name || null,
        inviterPatientId: inviterPatientId,
        invitedPatientId: invitedPatientId,
        status: ref.status || "PENDING",
        discountPercent: ref.discount_percent || null,
        inviterDiscountPercent: ref.inviter_discount_percent || null,
        invitedDiscountPercent: ref.invited_discount_percent || null,
        createdAt: ref.created_at ? new Date(ref.created_at).getTime() : Date.now(),
        checkInAt: ref.check_in_at ? new Date(ref.check_in_at).getTime() : null,
        approvedAt: ref.approved_at ? new Date(ref.approved_at).getTime() : null,
      };
    }));

    res.json({ ok: true, items: formattedReferrals });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Patient Referrals GET error:", error);
    res.status(500).json({ ok: false, error: "referrals_fetch_exception", details: error.message });
  }
});

/* ================= PATIENT HEALTH FORM ================= */
// GET health form
app.get("/api/patient/:patientId/health", async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    // Verify token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const token = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tokenPatientId = decoded.patientId;
    const clinicCode = decoded.clinicCode;

    if (tokenPatientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    // Get health form data
    const { data: healthForm, error } = await supabase
      .from("patient_health_forms")
      .select("*")
      .eq("patient_id", patientId)
      .eq("clinic_code", clinicCode)
      .maybeSingle();

    if (error) {
      console.error("Health Form GET - Supabase error:", error);
      return res.status(500).json({ ok: false, error: "health_form_fetch_failed", details: error.message });
    }

    if (!healthForm) {
      return res.json({ ok: true, formData: null, isComplete: false });
    }

    res.json({ 
      ok: true, 
      formData: healthForm.form_data || {},
      isComplete: healthForm.is_complete || false,
      completedAt: healthForm.completed_at || null,
      updatedAt: healthForm.updated_at || null
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Health Form GET - Error:", error);
    res.status(500).json({ ok: false, error: "health_form_fetch_failed", details: error.message });
  }
});

// POST/PUT health form
app.post("/api/patient/:patientId/health", async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    // Verify token
    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const token = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tokenPatientId = decoded.patientId;
    const clinicCode = decoded.clinicCode;

    if (tokenPatientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    const formData = req.body.formData || {};
    const isComplete = req.body.isComplete === true;

    const now = Date.now();

    // Check if form exists
    const { data: existingForm, error: checkError } = await supabase
      .from("patient_health_forms")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_code", clinicCode)
      .maybeSingle();

    if (checkError) {
      console.error("Health Form POST - Check error:", checkError);
      return res.status(500).json({ ok: false, error: "health_form_save_failed", details: checkError.message });
    }

    const formRecord = {
      patient_id: patientId,
      clinic_code: clinicCode,
      form_data: formData,
      is_complete: isComplete,
      updated_at: now,
    };

    if (isComplete && !existingForm) {
      formRecord.completed_at = now;
      formRecord.created_at = now;
    } else if (isComplete && existingForm && !existingForm.completed_at) {
      formRecord.completed_at = now;
    }

    let result;
    if (existingForm) {
      // Update existing form
      const { data, error } = await supabase
        .from("patient_health_forms")
        .update(formRecord)
        .eq("id", existingForm.id)
        .select()
        .single();

      if (error) {
        console.error("Health Form POST - Update error:", error);
        return res.status(500).json({ ok: false, error: "health_form_save_failed", details: error.message });
      }
      result = data;
    } else {
      // Create new form
      formRecord.created_at = now;
      const { data, error } = await supabase
        .from("patient_health_forms")
        .insert(formRecord)
        .select()
        .single();

      if (error) {
        console.error("Health Form POST - Insert error:", error);
        return res.status(500).json({ ok: false, error: "health_form_save_failed", details: error.message });
      }
      result = data;
    }

    res.json({ 
      ok: true, 
      formData: result.form_data || {},
      isComplete: result.is_complete || false,
      completedAt: result.completed_at || null,
      updatedAt: result.updated_at || null
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Health Form POST - Error:", error);
    res.status(500).json({ ok: false, error: "health_form_save_failed", details: error.message });
  }
});

app.put("/api/patient/:patientId/health", async (req, res) => {
  // Same as POST
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const authHeader = req.headers.authorization;
    const tokenHeader = req.headers["x-patient-token"];
    const token = authHeader?.startsWith("Bearer ") 
      ? authHeader.substring(7) 
      : tokenHeader;

    if (!token) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const tokenPatientId = decoded.patientId;
    const clinicCode = decoded.clinicCode;

    if (tokenPatientId !== patientId) {
      return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
    }

    const formData = req.body.formData || {};
    const isComplete = req.body.isComplete === true;

    const now = Date.now();

    const { data: existingForm, error: checkError } = await supabase
      .from("patient_health_forms")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_code", clinicCode)
      .maybeSingle();

    if (checkError) {
      console.error("Health Form PUT - Check error:", checkError);
      return res.status(500).json({ ok: false, error: "health_form_save_failed", details: checkError.message });
    }

    const formRecord = {
      patient_id: patientId,
      clinic_code: clinicCode,
      form_data: formData,
      is_complete: isComplete,
      updated_at: now,
    };

    if (isComplete && !existingForm) {
      formRecord.completed_at = now;
      formRecord.created_at = now;
    } else if (isComplete && existingForm && !existingForm.completed_at) {
      formRecord.completed_at = now;
    }

    let result;
    if (existingForm) {
      const { data, error } = await supabase
        .from("patient_health_forms")
        .update(formRecord)
        .eq("id", existingForm.id)
        .select()
        .single();

      if (error) {
        console.error("Health Form PUT - Update error:", error);
        return res.status(500).json({ ok: false, error: "health_form_save_failed", details: error.message });
      }
      result = data;
    } else {
      formRecord.created_at = now;
      const { data, error } = await supabase
        .from("patient_health_forms")
        .insert(formRecord)
        .select()
        .single();

      if (error) {
        console.error("Health Form PUT - Insert error:", error);
        return res.status(500).json({ ok: false, error: "health_form_save_failed", details: error.message });
      }
      result = data;
    }

    res.json({ 
      ok: true, 
      formData: result.form_data || {},
      isComplete: result.is_complete || false,
      completedAt: result.completed_at || null,
      updatedAt: result.updated_at || null
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Health Form PUT - Error:", error);
    res.status(500).json({ ok: false, error: "health_form_save_failed", details: error.message });
  }
});

/* ================= ADMIN HEALTH FORM ================= */
// GET health form (admin)
app.get("/api/admin/patients/:patientId/health", adminAuth, async (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const clinicId = req.clinicId;
    const clinicCode = req.clinicCode;

    // Verify patient belongs to clinic
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id, patient_id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (patientError) {
      console.error("Admin Health Form GET - Patient query error:", patientError);
      return res.status(500).json({ ok: false, error: "database_error", details: patientError.message });
    }

    if (!patientData) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get health form data
    const { data: healthForm, error } = await supabase
      .from("patient_health_forms")
      .select("*")
      .eq("patient_id", patientId)
      .eq("clinic_code", clinicCode)
      .maybeSingle();

    if (error) {
      console.error("Admin Health Form GET - Supabase error:", error);
      return res.status(500).json({ ok: false, error: "health_form_fetch_failed", details: error.message });
    }

    if (!healthForm) {
      return res.json({ ok: true, formData: null, isComplete: false });
    }

    res.json({ 
      ok: true, 
      formData: healthForm.form_data || {},
      isComplete: healthForm.is_complete || false,
      completedAt: healthForm.completed_at || null,
      updatedAt: healthForm.updated_at || null,
      createdAt: healthForm.created_at || null
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Admin Health Form GET - Error:", error);
    res.status(500).json({ ok: false, error: "health_form_fetch_failed", details: error.message });
  }
});

/* ================= ADMIN REFERRALS (GET) ================= */
app.get("/api/admin/referrals", adminAuth, async (req, res) => {
  try {
    // This endpoint is dynamic and must never be cached (prevents 304/empty stale lists in admin).
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    });
    res.removeHeader("ETag");

    const status = String(req.query.status || "").trim().toUpperCase();
    console.log(`[ADMIN REFERRALS] Fetching referrals for clinic_id: ${req.admin?.clinicId}, clinic_code: ${req.admin?.clinicCode}, status filter: ${status || "ALL"}`);

    const normalizeReferralStatus = (value) => {
      const raw = String(value || "").trim().toUpperCase();
      if (!raw) return "PENDING";
      if (["INVITED", "REGISTERED", "CREATED", "SENT"].includes(raw)) return "PENDING";
      if (raw === "COMPLETED") return "APPROVED";
      if (raw === "CANCELLED") return "REJECTED";
      return raw;
    };

    const isMissingClinicCodeColumn = (error) =>
      String(error?.code || "") === "42703" &&
      String(error?.message || "").toLowerCase().includes("clinic_code");

    const fetchReferralsByClinic = async () => {
      const clinicId = req.admin?.clinicId;
      const clinicCode = req.admin?.clinicCode;
      
      console.log("[ADMIN REFERRALS] Using clinicId:", clinicId, "clinicCode:", clinicCode);
      
      if (!clinicId) {
        console.error("ClinicId missing in admin referrals endpoint");
        return res.status(400).json({ ok: false, error: "clinic_missing" });
      }

      const { data: byId, error: byIdError } = await supabase
        .from("referrals")
        .select("*")
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });

      if (byIdError) {
        return { data: null, error: byIdError, source: "clinic_id" };
      }

      if (Array.isArray(byId) && byId.length > 0) {
        return { data: byId, error: null, source: "clinic_id" };
      }

      if (!clinicCode) {
        return { data: byId || [], error: null, source: "clinic_id" };
      }

      const { data: byCode, error: byCodeError } = await supabase
        .from("referrals")
        .select("*")
        .eq("clinic_code", clinicCode)
        .order("created_at", { ascending: false });

      if (byCodeError) {
        if (isMissingClinicCodeColumn(byCodeError)) {
          console.warn("[ADMIN REFERRALS] clinic_code column missing; using clinic_id only");
          return { data: byId || [], error: null, source: "clinic_id" };
        }
        return { data: null, error: byCodeError, source: "clinic_code" };
      }

      return { data: byCode || [], error: null, source: "clinic_code" };
    };
    
    // Önce tüm referral'ları çek (debug için)
    const { data: allReferrals, error: allError, source } = await fetchReferralsByClinic();
    
    if (allError) {
      console.error("[ADMIN REFERRALS] Supabase error (all):", allError);
      return res.status(500).json({ ok: false, error: "referrals_fetch_failed", details: allError.message });
    } else {
      console.log(`[ADMIN REFERRALS] Total referrals in DB: ${allReferrals?.length || 0}`);
      console.log(`[ADMIN REFERRALS] Source: ${source}`);
      if (allReferrals && allReferrals.length > 0) {
      console.log(`[ADMIN REFERRALS] Status breakdown:`, {
        PENDING: allReferrals.filter(r => normalizeReferralStatus(r.status) === "PENDING").length,
        APPROVED: allReferrals.filter(r => normalizeReferralStatus(r.status) === "APPROVED").length,
        REJECTED: allReferrals.filter(r => normalizeReferralStatus(r.status) === "REJECTED").length,
        NULL: allReferrals.filter(r => !r.status).length,
      });
        // İlk birkaç referral'ın detaylarını logla
        allReferrals.slice(0, 3).forEach((r, i) => {
          console.log(`[ADMIN REFERRALS] Referral ${i + 1}:`, {
            id: r.referral_id || r.id,
            status: r.status || "NULL",
            inviter: r.inviter_patient_name || r.inviter_name,
            invited: r.invited_patient_name || r.invited_name,
          });
        });
      }
    }
    
    let filteredReferrals = allReferrals || [];
    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      filteredReferrals = (allReferrals || []).filter(ref => normalizeReferralStatus(ref.status) === status);
      console.log(`[ADMIN REFERRALS] Status filter ${status}: ${allReferrals?.length || 0} total, ${filteredReferrals.length} after filter`);
    }

    filteredReferrals.forEach(ref => {
      ref.status = normalizeReferralStatus(ref.status);
    });
    
    console.log(`[ADMIN REFERRALS] Found ${filteredReferrals?.length || 0} referral(s) after filter for clinic_id: ${req.clinicId}`);

    // Frontend formatına dönüştür
    // UUID'leri patient_id (TEXT) formatına çevir
    const formattedReferrals = await Promise.all((filteredReferrals || []).map(async (ref) => {
      // Inviter patient_id'yi al
      let inviterPatientId = null;
      if (ref.inviter_patient_id) {
        const { data: inviterPatient, error: inviterError } = await supabase
          .from("patients")
          .select("name, name")
          .eq("id", ref.inviter_patient_id)
          .maybeSingle();
        if (!inviterError && inviterPatient) {
          inviterPatientId = inviterPatient.patient_id || null;
          // Eğer inviter_patient_name yoksa ama patient name varsa, onu kullan
          if (!ref.inviter_patient_name && inviterPatient.name) {
            ref.inviter_patient_name = inviterPatient.name;
          }
        }
      }
      
      // Invited patient_id'yi al
      let invitedPatientId = null;
      if (ref.invited_patient_id) {
        const { data: invitedPatient, error: invitedError } = await supabase
          .from("patients")
          .select("name, name")
          .eq("id", ref.invited_patient_id)
          .maybeSingle();
        if (!invitedError && invitedPatient) {
          invitedPatientId = invitedPatient.patient_id || null;
          // Eğer invited_patient_name yoksa ama patient name varsa, onu kullan
          if (!ref.invited_patient_name && invitedPatient.name) {
            ref.invited_patient_name = invitedPatient.name;
          }
        }
      }
      
      const formattedRef = {
        id: ref.referral_id || ref.id,
        inviterPatientName: ref.inviter_patient_name || null,
        invitedPatientName: ref.invited_patient_name || null,
        inviterPatientId: inviterPatientId || null,
        invitedPatientId: invitedPatientId || null,
        status: (ref.status || "PENDING").toUpperCase(),
        discountPercent: ref.discount_percent || null,
        inviterDiscountPercent: ref.inviter_discount_percent || null,
        invitedDiscountPercent: ref.invited_discount_percent || null,
        createdAt: ref.created_at ? new Date(ref.created_at).getTime() : Date.now(),
        checkInAt: ref.check_in_at ? new Date(ref.check_in_at).getTime() : null,
        approvedAt: ref.approved_at ? new Date(ref.approved_at).getTime() : null,
      };
      
      console.log(`[ADMIN REFERRALS] Formatted referral:`, {
        id: formattedRef.id,
        inviter: formattedRef.inviterPatientName || formattedRef.inviterPatientId || "N/A",
        invited: formattedRef.invitedPatientName || formattedRef.invitedPatientId || "N/A",
        status: formattedRef.status,
      });
      
      return formattedRef;
    }));

    console.log(`[ADMIN REFERRALS] Returning ${formattedReferrals.length} formatted referral(s)`);
    res.json({ ok: true, items: formattedReferrals });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN REFERRALS] Exception:", error);
    res.status(500).json({ ok: false, error: "referrals_fetch_exception", details: error.message });
  }
});

/* ================= ADMIN REFERRAL APPROVE ================= */
app.patch("/api/admin/referrals/:referralId/approve", adminAuth, async (req, res) => {
  try {
    const referralId = String(req.params.referralId || "").trim();
    if (!referralId) {
      return res.status(400).json({ ok: false, error: "referral_id_required" });
    }

    const { inviterDiscountPercent, invitedDiscountPercent } = req.body || {};
    
    // En az bir indirim yüzdesi girilmeli
    if ((inviterDiscountPercent === null || inviterDiscountPercent === undefined) &&
        (invitedDiscountPercent === null || invitedDiscountPercent === undefined)) {
      return res.status(400).json({ ok: false, error: "at_least_one_discount_required" });
    }

    console.log(`[ADMIN REFERRAL APPROVE] Approving referral ${referralId} for clinic ${req.clinicId}`);
    console.log(`[ADMIN REFERRAL APPROVE] Inviter discount: ${inviterDiscountPercent}%, Invited discount: ${invitedDiscountPercent}%`);

    // Referral'ı bul ve güncelle
    const { data: referral, error: findError } = await supabase
      .from("referrals")
      .select("*")
      .eq("id", referralId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (findError || !referral) {
      console.error("[ADMIN REFERRAL APPROVE] Referral not found:", findError);
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }

    // Referral'ı güncelle
    const updateData = {
      status: "approved",
      approved_at: new Date().toISOString(),
    };

    if (inviterDiscountPercent !== null && inviterDiscountPercent !== undefined) {
      updateData.inviter_discount_percent = inviterDiscountPercent;
    }

    if (invitedDiscountPercent !== null && invitedDiscountPercent !== undefined) {
      updateData.invited_discount_percent = invitedDiscountPercent;
    }

    const { data: updatedReferral, error: updateError } = await supabase
      .from("referrals")
      .update(updateData)
      .eq("id", referralId)
      .eq("clinic_id", req.clinicId)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN REFERRAL APPROVE] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "approval_failed", details: updateError.message });
    }

    console.log(`[ADMIN REFERRAL APPROVE] Successfully approved referral ${referralId}`);
    
    res.json({
      ok: true,
      item: {
        id: updatedReferral.referral_id || updatedReferral.id,
        status: updatedReferral.status,
        inviterDiscountPercent: updatedReferral.inviter_discount_percent || null,
        invitedDiscountPercent: updatedReferral.invited_discount_percent || null,
      },
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN REFERRAL APPROVE] Exception:", error);
    res.status(500).json({ ok: false, error: "approval_exception", details: error.message });
  }
});

/* ================= ADMIN REFERRAL REJECT ================= */
app.patch("/api/admin/referrals/:referralId/reject", adminAuth, async (req, res) => {
  try {
    const referralId = String(req.params.referralId || "").trim();
    if (!referralId) {
      return res.status(400).json({ ok: false, error: "referral_id_required" });
    }

    console.log(`[ADMIN REFERRAL REJECT] Rejecting referral ${referralId} for clinic ${req.clinicId}`);

    // Referral'ı bul ve güncelle
    const { data: referral, error: findError } = await supabase
      .from("referrals")
      .select("*")
      .eq("id", referralId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (findError || !referral) {
      console.error("[ADMIN REFERRAL REJECT] Referral not found:", findError);
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }

    // Referral'ı rejected olarak güncelle
    const { data: updatedReferral, error: updateError } = await supabase
      .from("referrals")
      .update({
        status: "rejected",
        approved_at: null, // Approve date'i temizle
      })
      .eq("id", referralId)
      .eq("clinic_id", req.clinicId)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN REFERRAL REJECT] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "rejection_failed", details: updateError.message });
    }

    console.log(`[ADMIN REFERRAL REJECT] Successfully rejected referral ${referralId}`);
    
    res.json({
      ok: true,
      item: {
        id: updatedReferral.referral_id || updatedReferral.id,
        status: updatedReferral.status,
      },
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN REFERRAL REJECT] Exception:", error);
    res.status(500).json({ ok: false, error: "rejection_exception", details: error.message });
  }
});

/* ================= OTP RATE LIMIT ================= */
const otpRateLimit = new Map(); // email -> { lastSent: timestamp, count: number }

function checkOtpRateLimit(email) {
  const now = Date.now();
  const limit = otpRateLimit.get(email);
  
  if (!limit) {
    otpRateLimit.set(email, { lastSent: now, count: 1 });
    return true;
  }
  
  // Check if 120 seconds have passed
  if (now - limit.lastSent < 120000) { // 120 seconds
    throw new Error("OTP requested too frequently. Please wait 2 minutes before requesting another code.");
  }
  
  // Check daily limit (5 OTP per day)
  const dayStart = new Date().setHours(0, 0, 0, 0);
  if (limit.lastSent < dayStart) {
    limit.count = 0;
  }
  
  if (limit.count >= 5) {
    throw new Error("Daily OTP limit reached. Please try again tomorrow.");
  }
  
  limit.lastSent = now;
  limit.count++;
  return true;
}

/* ================= OTP REQUEST ================= */
// Alias endpoint for frontend compatibility
app.post("/auth/request-otp", async (req, res) => {
  try {
    const { phone, email, role } = req.body || {};

    console.log("[OTP REQUEST] Request received:", {
      phone,
      email,
      role
    });

    // Validation
    if (!phone && !email) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_contact",
        message: "Phone or email is required" 
      });
    }

    // For demo purposes, simulate OTP sending
    const otp = "123456"; // Fixed OTP for demo
    
    console.log("[OTP REQUEST] OTP sent (demo):", {
      phone: phone?.trim(),
      email: email?.trim(),
      role: role || "PATIENT",
      otp: otp
    });

    res.json({
      ok: true,
      message: "OTP sent successfully",
      otp: otp, // Only for demo purposes
      phone: phone?.trim(),
      email: email?.trim()
    });

  } catch (err) {
    console.error("[OTP REQUEST] Error:", err);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error",
      message: "Failed to send OTP"
    });
  }
});

/* ================= OTP SEND ================= */
app.post("/auth/send-otp", async (req, res) => {
  try {
    const { phone, email } = req.body || {};

    console.log("[OTP SEND] Request received:", {
      phone,
      email
    });

    // Validation
    if (!phone) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_phone",
        message: "Phone number is required" 
      });
    }

    // DEV bypass for OTP
    if (process.env.NODE_ENV !== "production") {
      const otp = "123456";
      console.log("[OTP SEND] DEV OTP:", otp);
      return res.json({
        ok: true,
        message: "OTP sent successfully",
        otp: otp, // Only for dev
        patientId: "DEV_PATIENT",
        phone: phone.trim()
      });
    }

    // Check rate limit
    if (email) {
      try {
        checkOtpRateLimit(email);
      } catch (rateError) {
        return res.status(429).json({ 
          ok: false, 
          error: "rate_limit_exceeded",
          message: rateError.message 
        });
      }
    }

    // Find patient by phone
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("*")
      .eq("phone", normalizedPhone)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ 
        ok: false, 
        error: "patient_not_found",
        message: "Patient not found" 
      });
    }

    // For demo purposes, simulate OTP sending
    const otp = "123456"; // Fixed OTP for demo
    
    console.log("[OTP SEND] OTP sent (demo):", {
      phone: phone.trim(),
      otp: otp,
      patientId: patient.name,
      role: patient.role
    });

    res.json({
      ok: true,
      message: "OTP sent successfully",
      otp: otp, // Only for demo purposes
      patientId: patient.name,
      phone: phone.trim()
    });

  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[OTP SEND] Error:", error);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error",
      message: "Internal server error" 
    });
  }
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({ ok: true, port: String(PORT) });
});

/* ================= FAVICON ================= */
app.get("/favicon.ico", (req, res) => {
  res.status(404).send("Favicon not found");
});

/* ================= OTP VERIFICATION ================= */
// 🔥 CRITICAL: UNIFIED OTP VERIFICATION WITH TYPE-BASED RESPONSES
app.post("/auth/verify-otp", async (req, res) => {
  try {
    const { otp, phone, email, sessionId, type, role } = req.body || {};

    console.log("[OTP VERIFY] Request received:", {
      otp,
      phone,
      email,
      sessionId,
      type,
      role
    });

    // 🔥 FLEXIBLE VALIDATION: Accept both type and role
    const userType = type || role;
    if (!userType || !["patient", "doctor", "admin", "PATIENT", "DOCTOR", "ADMIN"].includes(userType)) {
      return res.status(400).json({ 
        ok: false, 
        error: "invalid_type",
        message: "Type is required and must be: patient | doctor | admin" 
      });
    }

    // Normalize type to lowercase
    const normalizedType = userType.toLowerCase();

    // Validation
    if (!otp || !phone) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_parameters",
        message: "OTP and phone are required" 
      });
    }

    // Normalize phone number (remove +, spaces, etc.)
    const normalizedPhone = phone.replace(/[^\d]/g, '').trim();
    console.log("[OTP VERIFY] Normalized phone:", { original: phone, normalized: normalizedPhone });

    // DEV bypass for OTP verification
    if (process.env.NODE_ENV !== "production") {
      console.log("[OTP VERIFY] DEV mode: Accepting any OTP for type:", normalizedType);
      
      if (normalizedType === "patient") {
        // Check if this is a DEV_PATIENT request
        if (sessionId === "DEV_PATIENT") {
          console.log("[OTP VERIFY] DEV_PATIENT mode: Creating mock patient");
          
          const mockPatient = {
            patient_id: "DEV_PATIENT",
            name: "DEV User",
            phone: normalizedPhone,
            email: email || "dev@example.com",
            role: "PATIENT",
            status: "ACTIVE",
            clinic_id: "dev-clinic-id",
            clinic_code: "DEV"
          };

          const token = jwt.sign(
            {
              patientId: mockPatient.name,
              clinicId: mockPatient.clinic_id,
              clinicCode: mockPatient.clinic_code,
              role: mockPatient.role,
              type: "patient",
              status: mockPatient.status
            },
            JWT_SECRET,
            { expiresIn: "30d" }
          );

          console.log("[OTP VERIFY] DEV_PATIENT Success:", mockPatient);

          return res.json({
            ok: true,
            token,
            patientId: mockPatient.name,
            type: "patient",
            role: "PATIENT",
            status: mockPatient.status
          });
        }
        
        // Find patient by phone for DEV mode
        const { data: patient, error: patientError } = await supabase
          .from("patients")
          .select("*")
          .eq("phone", normalizedPhone)
          .single();

        if (patientError || !patient) {
          return res.status(404).json({ 
            ok: false, 
            error: "patient_not_found",
            message: "Patient not found" 
          });
        }

        const token = jwt.sign(
          {
            patientId: patient.name,
            clinicId: patient.clinic_id,
            clinicCode: patient.clinic_code,
            role: patient.role,
            type: "patient",
            status: patient.status
          },
          JWT_SECRET,
          { expiresIn: "30d" }
        );

        console.log("[OTP VERIFY] DEV Patient Success:", {
          patientId: patient.name,
          phone: phone,
          role: patient.role
        });

        return res.json({
          ok: true,
          token,
          patientId: patient.name,
          type: "patient",
          role: "PATIENT",
          status: patient.status
        });
      } else if (normalizedType === "doctor") {
        // Find doctor by phone for DEV mode
        const { data: doctor, error: doctorError } = await supabase
          .from("patients")
          .select("*")
          .eq("phone", normalizedPhone)
          .single();

        if (doctorError || !doctor) {
          return res.status(404).json({ 
            ok: false, 
            error: "doctor_not_found",
            message: "Doctor not found" 
          });
        }

        const token = jwt.sign(
          {
            doctorId: doctor.id,
            clinicId: doctor.clinic_id,
            role: doctor.role,
            type: "doctor",
            status: doctor.status
          },
          JWT_SECRET,
          { expiresIn: "30d" }
        );

        console.log("[OTP VERIFY] DEV Doctor Success:", {
          doctorId: doctor.id,
          phone: phone,
          role: doctor.role,
          status: doctor.status
        });

        return res.json({
          ok: true,
          token,
          doctorId: doctor.id,
          clinicId: doctor.clinic_id,
          type: "doctor",
          role: "DOCTOR",
          status: doctor.status
        });
      } else if (normalizedType === "admin") {
        // Find admin by phone for DEV mode
        const { data: clinic, error: clinicError } = await supabase
          .from("clinics")
          .select("*")
          .eq("phone", normalizedPhone)
          .single();

        if (!clinic?.data) {
          return res.status(404).json({ 
            ok: false, 
            error: "clinic_not_found",
            message: "Clinic not found" 
          });
        }

        const token = jwt.sign(
          {
            clinicId: clinic.id,
            clinicCode: clinic.clinic_code,
            role: "ADMIN",
            type: "admin"
          },
          JWT_SECRET,
          { expiresIn: "30d" }
        );

        console.log("[OTP VERIFY] DEV Admin Success:", {
          clinicId: clinic.id,
          phone: phone,
          role: "ADMIN"
        });

        return res.json({
          ok: true,
          token,
          clinicId: clinic.id,
          clinicCode: clinic.clinic_code,
          type: "admin",
          role: "ADMIN"
        });
      }
    }

    // For demo purposes, accept any 6-digit OTP
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ 
        ok: false, 
        error: "invalid_otp_format",
        message: "OTP must be 6 digits" 
      });
    }

    // 🔥 TYPE-BASED USER LOOKUP AND RESPONSE
    if (type === "patient") {
      // Find patient by phone
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", normalizedPhone)
        .single();

      if (patientError || !patient) {
        return res.status(404).json({ 
          ok: false, 
          error: "patient_not_found",
          message: "Patient not found" 
        });
      }

      const token = jwt.sign(
        {
          patientId: patient.name,
          clinicId: patient.clinic_id,
          clinicCode: patient.clinic_code,
          role: patient.role,
          type: "patient",
          status: patient.status
        },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      console.log("[OTP VERIFY] Patient Success:", {
        patientId: patient.name,
        phone: phone,
        role: patient.role
      });

      return res.json({
        ok: true,
        token,
        patientId: patient.name,
        type: "patient",
        role: "PATIENT",
        status: patient.status
      });
    } else if (normalizedType === "doctor") {
      // Find doctor by phone
      const { data: doctor, error: doctorError } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", normalizedPhone)
        .single();

      if (doctorError || !doctor) {
        return res.status(404).json({ 
          ok: false, 
          error: "doctor_not_found",
          message: "Doctor not found" 
        });
      }

      const token = jwt.sign(
        {
          doctorId: doctor.id,
          clinicId: doctor.clinic_id,
          role: doctor.role,
          type: "doctor",
          status: doctor.status
        },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      console.log("[OTP VERIFY] Doctor Success:", {
        doctorId: doctor.id,
        phone: phone,
        role: doctor.role,
        status: doctor.status
      });

      return res.json({
        ok: true,
        token,
        doctorId: doctor.id,
        clinicId: doctor.clinic_id,
        type: "doctor",
        role: "DOCTOR",
        status: doctor.status
      });
    } else if (normalizedType === "admin") {
      // Find clinic by phone (admin)
      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .select("*")
        .eq("phone", normalizedPhone)
        .single();

      if (!clinic?.data) {
        return res.status(404).json({ 
          ok: false, 
          error: "clinic_not_found",
          message: "Clinic not found" 
        });
      }

      const token = jwt.sign(
        {
          clinicId: clinic.id,
          clinicCode: clinic.clinic_code,
          role: "ADMIN",
          type: "admin"
        },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      console.log("[OTP VERIFY] Admin Success:", {
        clinicId: clinic.id,
        phone: phone,
        role: "ADMIN"
      });

      return res.json({
        ok: true,
        token,
        clinicId: clinic.id,
        clinicCode: clinic.clinic_code,
        type: "admin",
        role: "ADMIN"
      });
    }

  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[OTP VERIFY] Error:", error);
    console.error("[OTP VERIFY] Error stack:", error.stack);
    console.error("[OTP VERIFY] Request data:", { otp, phone, email, sessionId, type });
    res.status(500).json({ 
      ok: false, 
      error: "internal_error",
      message: error.message 
    });
  }
});

/* ================= TEST CLINIC CREATE ================= */
// Test için basit clinic oluşturma endpoint'i
app.post("/api/test/create-clinic", async (req, res) => {
  try {
    const { clinicCode = "TEST01", clinicName = "Test Clinic" } = req.body || {};
    
    const trimmedClinicCode = String(clinicCode).trim().toUpperCase();
    
    // Mevcut clinic var mı kontrol et
    const { data: existing } = await supabase
      .from("clinics")
      .select("id, clinic_code, name")
      .eq("clinic_code", trimmedClinicCode)
      .maybeSingle();
    
    if (existing) {
      return res.json({ 
        ok: true, 
        message: "Clinic already exists", 
        clinicCode: existing.clinic_code,
        clinicName: existing.name,
        clinicId: existing.id 
      });
    }
    
    // Test clinic oluştur
    const passwordHash = await bcrypt.hash("Test123!", 10);
    
    const { data: newClinic, error } = await supabase
      .from("clinics")
      .insert({
        clinic_code: trimmedClinicCode,
        name: String(clinicName).trim(),
        email: `test_${trimmedClinicCode.toLowerCase()}@example.com`,
        password_hash: passwordHash,
        clinic_type: "DENTAL",
        enabled_modules: ["UPLOADS", "TRAVEL", "REFERRALS", "CHAT", "PATIENTS", "DENTAL_TREATMENTS", "DENTAL_TEETH_CHART"],
        plan: "FREE",
        max_patients: 10,
        address: "",
        phone: "",
        website: "",
        logo_url: "",
        google_maps_url: "",
        default_inviter_discount_percent: null,
        default_invited_discount_percent: null,
        branding: { showPoweredBy: true }
      })
      .select()
      .single();
    
    if (error) {
      console.error("[TEST CREATE CLINIC] Error:", error);
      return res.status(500).json({ ok: false, error: error.message, details: error });
    }
    
    res.json({ 
      ok: true, 
      message: "Test clinic created successfully",
      clinicCode: newClinic.clinic_code,
      clinicId: newClinic.id,
      clinicName: newClinic.name
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[TEST CREATE CLINIC] Exception:", error);
    res.status(500).json({ ok: false, error: error?.message || "Unknown error" });
  }
});

/* ================= HAIR TRANSPLANT MODULE (DISABLED - DENTAL ONLY) ================= */
// Hair transplant endpoints are disabled - only DENTAL clinics are supported
// All HAIR-related endpoints and functions are commented out below
/*
// Zone definitions (Clinicator Hair Mapping Standard)
const HAIR_ZONES = {
  RECIPIENT: ["F2", "F3", "F4", "F5", "F6"],
  DONOR: ["D1", "D2", "D3", "D4"],
};

const ZONE_LABELS = {
  F2: "Front hairline",
  F3: "Front-mid scalp",
  F4: "Mid scalp",
  F5: "Upper lateral areas",
  F6: "Crown / top transition",
  D1: "Lower occipital (safest donor zone)",
  D2: "Mid donor zone",
  D3: "Left side donor",
  D4: "Right side donor",
};

// Default graft density options (grafts/cm²)
const DEFAULT_GRAFT_DENSITIES = [20, 25, 30, 35, 40];

app.get("/api/hair/zones/:patientId", adminAuth, async (req, res) => {
  try {
    const patientId = req.params.patientId;
    
    // Verify patient belongs to clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, clinic_id")
      .eq("patient_id", patientId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get all zones for this patient
    const { data: zones, error } = await supabase
      .from("patient_hair_zones")
      .select("*")
      .eq("patient_id", patient.id)
      .order("zone_id", { ascending: true });

    if (error) {
      console.error("[HAIR ZONES GET] Error:", error);
      return res.status(500).json({ ok: false, error: "fetch_failed", details: error.message });
    }

    res.json({
      ok: true,
      zones: zones || [],
      zoneDefinitions: {
        recipient: HAIR_ZONES.RECIPIENT,
        donor: HAIR_ZONES.DONOR,
        labels: ZONE_LABELS,
      },
      defaultDensities: DEFAULT_GRAFT_DENSITIES,
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[HAIR ZONES GET] Exception:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= HAIR ZONES (POST/PUT) =================
// Create or update a zone
app.post("/api/hair/zones/:patientId", adminAuth, async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const { zoneId, zoneType, areaCm2, graftDensity, plannedGrafts, angleNote, priority, notes, status, maxCapacity, extractedGrafts } = req.body;

    // Validate zone ID
    const allZones = [...HAIR_ZONES.RECIPIENT, ...HAIR_ZONES.DONOR];
    if (!allZones.includes(zoneId)) {
      return res.status(400).json({ ok: false, error: "invalid_zone_id" });
    }

    // Validate zone type matches zone ID
    const expectedType = HAIR_ZONES.RECIPIENT.includes(zoneId) ? "RECIPIENT" : "DONOR";
    if (zoneType !== expectedType) {
      return res.status(400).json({ ok: false, error: "zone_type_mismatch" });
    }

    // Verify patient belongs to clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, clinic_id")
      .eq("patient_id", patientId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Calculate planned grafts if area and density provided (for recipient zones)
    let finalPlannedGrafts = plannedGrafts;
    if (zoneType === "RECIPIENT" && areaCm2 && graftDensity) {
      finalPlannedGrafts = Math.round(areaCm2 * graftDensity);
    }

    // Calculate remaining capacity for donor zones
    let remainingCapacity = null;
    if (zoneType === "DONOR" && maxCapacity !== undefined) {
      const extracted = extractedGrafts || 0;
      remainingCapacity = maxCapacity - extracted;
    }

    // Check if zone already exists
    const { data: existingZone } = await supabase
      .from("patient_hair_zones")
      .select("id")
      .eq("patient_id", patient.id)
      .eq("zone_id", zoneId)
      .maybeSingle();

    const zoneData = {
      patient_id: patient.id,
      zone_id: zoneId,
      zone_type: zoneType,
      area_cm2: areaCm2 || null,
      graft_density: zoneType === "RECIPIENT" ? (graftDensity || null) : null,
      planned_grafts: finalPlannedGrafts || null,
      extracted_grafts: zoneType === "DONOR" ? (extractedGrafts || 0) : null,
      remaining_capacity: remainingCapacity,
      max_capacity: zoneType === "DONOR" ? (maxCapacity || null) : null,
      angle_note: angleNote || null,
      priority: priority || null,
      notes: notes || null,
      status: status || "PLANNED",
    };

    let result;
    if (existingZone) {
      // Update existing zone
      const { data: updatedZone, error: updateError } = await supabase
        .from("patient_hair_zones")
        .update(zoneData)
        .eq("id", existingZone.id)
        .select()
        .single();

      if (updateError) {
        console.error("[HAIR ZONES POST] Update error:", updateError);
        return res.status(500).json({ ok: false, error: "update_failed", details: updateError.message });
      }
      result = updatedZone;
    } else {
      // Create new zone
      const { data: newZone, error: insertError } = await supabase
        .from("patient_hair_zones")
        .insert(zoneData)
        .select()
        .single();

      if (insertError) {
        console.error("[HAIR ZONES POST] Insert error:", insertError);
        return res.status(500).json({ ok: false, error: "insert_failed", details: insertError.message });
      }
      result = newZone;
    }

    // Update summary
    await updateHairGraftsSummary(patient.id);

    res.json({
      ok: true,
      zone: {
        id: result.id,
        zoneId: result.zone_id,
        zoneType: result.zone_type,
        areaCm2: result.area_cm2,
        graftDensity: result.graft_density,
        plannedGrafts: result.planned_grafts,
        extractedGrafts: result.extracted_grafts,
        remainingCapacity: result.remaining_capacity,
        maxCapacity: result.max_capacity,
        angleNote: result.angle_note,
        priority: result.priority,
        notes: result.notes,
        status: result.status,
      },
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[HAIR ZONES POST] Exception:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= HAIR GRAFTS SUMMARY =================
// Get graft planning summary for a patient
app.get("/api/hair/summary/:patientId", adminAuth, async (req, res) => {
  try {
    const patientId = req.params.patientId;

    // Verify patient belongs to clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, clinic_id")
      .eq("patient_id", patientId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get summary
    const { data: summary } = await supabase
      .from("patient_hair_grafts")
      .select("*")
      .eq("patient_id", patient.id)
      .maybeSingle();

    // Get all zones for detailed breakdown
    const { data: zones } = await supabase
      .from("patient_hair_zones")
      .select("*")
      .eq("patient_id", patient.id);

    const recipientZones = (zones || []).filter((z) => z.zone_type === "RECIPIENT");
    const donorZones = (zones || []).filter((z) => z.zone_type === "DONOR");

    res.json({
      ok: true,
      summary: summary || {
        totalPlannedGrafts: 0,
        totalExtractedGrafts: 0,
        totalDonorCapacity: 0,
        totalDonorRemaining: 0,
      },
      recipientZones: recipientZones.length,
      donorZones: donorZones.length,
      zones: zones || [],
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[HAIR SUMMARY GET] Exception:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= HAIR DONOR ZONES =================
// Get donor zone information
app.get("/api/hair/donor/:patientId", adminAuth, async (req, res) => {
  try {
    const patientId = req.params.patientId;

    // Verify patient belongs to clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, clinic_id")
      .eq("patient_id", patientId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    // Get donor zones
    const { data: donorZones, error } = await supabase
      .from("patient_hair_zones")
      .select("*")
      .eq("patient_id", patient.id)
      .eq("zone_type", "DONOR")
      .order("zone_id", { ascending: true });

    if (error) {
      console.error("[HAIR DONOR GET] Error:", error);
      return res.status(500).json({ ok: false, error: "fetch_failed", details: error.message });
    }

    const totalCapacity = (donorZones || []).reduce((sum, z) => sum + (z.max_capacity || 0), 0);
    const totalExtracted = (donorZones || []).reduce((sum, z) => sum + (z.extracted_grafts || 0), 0);
    const totalRemaining = totalCapacity - totalExtracted;

    res.json({
      ok: true,
      donorZones: donorZones || [],
      totals: {
        totalCapacity,
        totalExtracted,
        totalRemaining,
        utilizationPercent: totalCapacity > 0 ? Math.round((totalExtracted / totalCapacity) * 100) : 0,
      },
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[HAIR DONOR GET] Exception:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Helper function to update hair grafts summary
async function updateHairGraftsSummary(patientUuid) {
  try {
    // Get all zones for this patient
    const { data: zones } = await supabase
      .from("patient_hair_zones")
      .select("*")
      .eq("patient_id", patientUuid);

    if (!zones) return;

    const recipientZones = zones.filter((z) => z.zone_type === "RECIPIENT");
    const donorZones = zones.filter((z) => z.zone_type === "DONOR");

    const totalPlannedGrafts = recipientZones.reduce((sum, z) => sum + (z.planned_grafts || 0), 0);
    const totalExtractedGrafts = donorZones.reduce((sum, z) => sum + (z.extracted_grafts || 0), 0);
    const totalDonorCapacity = donorZones.reduce((sum, z) => sum + (z.max_capacity || 0), 0);
    const totalDonorRemaining = donorZones.reduce((sum, z) => sum + (z.remaining_capacity || 0), 0);

    // Check if summary exists
    const { data: existingSummary } = await supabase
      .from("patient_hair_grafts")
      .select("id")
      .eq("patient_id", patientUuid)
      .maybeSingle();

    const summaryData = {
      patient_id: patientUuid,
      total_planned_grafts: totalPlannedGrafts,
      total_extracted_grafts: totalExtractedGrafts,
      total_donor_capacity: totalDonorCapacity,
      total_donor_remaining: totalDonorRemaining,
    };

    if (existingSummary) {
      await supabase
        .from("patient_hair_grafts")
        .update(summaryData)
        .eq("id", existingSummary.id);
    } else {
      await supabase
        .from("patient_hair_grafts")
        .insert(summaryData);
    }
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[updateHairGraftsSummary] Error:", error);
  }
}
*/
/* ================= END HAIR TRANSPLANT MODULE (DISABLED) ================= */

const treatmentRoutes = require('./server/routes/treatment');
app.use('/api/treatment', treatmentRoutes);

// Treatment Groups routes (Admin only)
const treatmentGroupsRoutes = require('./server/routes/treatment-groups');
app.use('/api/treatment-groups', treatmentGroupsRoutes);

// Patient Group Assignments routes (Admin only)
const patientGroupAssignmentsRoutes = require('./server/routes/patient-group-assignments');
app.use('/api/patient-group-assignments', patientGroupAssignmentsRoutes);

// Patients routes (Admin only)
const patientsRoutes = require('./server/routes/patients');
app.use('/api/patients', patientsRoutes);

// Serve static files from public directory (MOVED TO END)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(PUBLIC_DIR));

/* ================= START ================= */
app.listen(PORT, () => {
  ensureDirs();
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔧 Admin:        /admin.html`);
  console.log(`📁 Data dir:     ${DATA_DIR}`);
  console.log(`💡 Next.js Admin Travel: http://localhost:3000/admin/patients/[patientId]/travel`);
});
// Force deployment - Mon Feb  9 17:09:05 +04 2026
// Force deployment - Mon Feb  9 17:31:41 +04 2026
// Fresh deployment - Mon Feb  9 21:21:31 +04 2026
