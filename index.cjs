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
console.log("[INIT] Process cwd:", process.cwd());

// JWT_SECRET validation
if (!process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET is not defined in environment variables");
  process.exit(1);
}

console.log("[INIT] JWT_SECRET: ✅ Defined");

const express = require('express');
const path = require('path');

const app = express();
app.set("etag", false);

// ================= DOCTOR DASHBOARD ENDPOINT (REAL DATA) =================
// const jwt = require('jsonwebtoken'); // Already required elsewhere, avoid redeclaration

function isValidUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

app.get("/api/doctor/dashboard", async (req, res) => {
  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let doctorId = null;
    let clinicId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        doctorId = decoded.id || decoded.doctorId || decoded.doctor_id || null;
        clinicId = decoded.clinicId || decoded.clinic_id || null;
      } catch (e) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }
    }

    // Validate UUIDs
    if (!isValidUUID(doctorId) || (clinicId && !isValidUUID(clinicId))) {
      return res.status(400).json({ ok: false, error: "Invalid UUID for doctorId or clinicId" });
    }

    // Query Supabase for patients assigned to this doctor
    const { data: patients, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("primary_doctor_id", doctorId);
    if (patientError) {
      return res.status(500).json({ ok: false, error: patientError.message });
    }
    res.json({
      ok: true,
      doctor: {
        id: doctorId,
        // You can add more doctor info here if needed
      },
      stats: {
        totalPatients: patients ? patients.length : 0,
        // Add more real stats as needed
      },
      message: "Dashboard data from Supabase."
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

const cors = require("cors");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const { verifyAdminToken, adminAuth } = require('./admin-auth-middleware.js');
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "x-actor"],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' })); // Increase limit for logo uploads (base64)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
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

// Multer configuration for doctor profile photo upload
const doctorPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/heic",
      "image/heif",
      "image/webp",
    ];

    if (!allowedMimeTypes.includes(file.mimetype || "")) {
      return cb(new Error("Invalid file type. Allowed: JPG, PNG, HEIC, HEIF, WEBP"));
    }

    cb(null, true);
  },
});

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
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET is not defined in environment variables");
  process.exit(1);
}

/* ================= PATHS ================= */
const DATA_DIR = path.join(__dirname, "data");
const PATIENTS_DIR = path.join(DATA_DIR, "patients");
const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
const TRAVEL_DIR = path.join(DATA_DIR, "travel");
const TREATMENT_ITEM_OVERRIDES_DIR = path.join(DATA_DIR, "treatment-item-overrides");

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

/* ================= HELPERS ================= */
function ensureDirs() {
  [DATA_DIR, PATIENTS_DIR, TREATMENTS_DIR, TRAVEL_DIR, TREATMENT_ITEM_OVERRIDES_DIR].forEach((d) => {
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

function getTreatmentItemOverridePath(itemId) {
  const safeId = String(itemId || "").trim();
  if (!safeId) return null;
  return path.join(TREATMENT_ITEM_OVERRIDES_DIR, `${safeId}.json`);
}

function readTreatmentItemOverride(itemId) {
  const filePath = getTreatmentItemOverridePath(itemId);
  if (!filePath) return null;
  return safeReadJson(filePath, null);
}

function saveTreatmentItemOverride(itemId, patch) {
  const filePath = getTreatmentItemOverridePath(itemId);
  if (!filePath) return null;

  ensureDirs();
  const current = safeReadJson(filePath, {});
  const next = {
    ...(current || {}),
    ...(patch || {}),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

function applyTreatmentItemOverride(baseRow, overrideRow) {
  if (!baseRow || !overrideRow || typeof overrideRow !== "object") return baseRow;

  const pick = (key) => Object.prototype.hasOwnProperty.call(overrideRow, key);
  const merged = { ...(baseRow || {}) };

  if (pick("planned_date")) {
    merged.scheduled_at = overrideRow.planned_date;
    merged.scheduled_date = overrideRow.planned_date;
    merged.due_date = overrideRow.planned_date;
  }
  if (pick("note")) {
    merged.note = overrideRow.note;
    merged.notes = overrideRow.note;
  }
  if (pick("chair_no")) {
    merged.chair_no = overrideRow.chair_no;
    merged.chair = overrideRow.chair_no;
  }
  if (pick("doctor_id")) {
    merged.doctor_id = overrideRow.doctor_id;
    merged.created_by_doctor_id = overrideRow.doctor_id;
  }
  if (pick("price")) {
    merged.price = overrideRow.price;
  }
  if (pick("title")) {
    merged.procedure_description = overrideRow.title;
    merged.procedure_name = overrideRow.title;
  }
  if (pick("procedure_code")) {
    merged.procedure_code = overrideRow.procedure_code;
  }

  return merged;
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

    // Doctor can only access their own assigned patients
    if (req.role === "DOCTOR") {
      const { data: patient } = await supabase
        .from("patients")
        .select("primary_doctor_id")
        .eq("id", patientId)
        .single();

      if (!patient || patient.primary_doctor_id !== req.doctorId) {
        return res.status(403).json({
          ok: false,
          error: "not_assigned_doctor"
        });
      }
    }

    // 2. patient_treatments tablosundan treatments_data'yı çek
    const { data: treatmentsData, error: treatmentsError } = await supabase
      .from("patient_treatments")
      .select("treatments_data, updated_at")
      .eq("patient_id", patientUuid)
      .maybeSingle();

    const treatmentsJson = (!treatmentsError && treatmentsData?.treatments_data) ? treatmentsData.treatments_data : {};
    const result = {
      ...treatmentsJson,
      schemaVersion: treatmentsJson.schemaVersion || 1,
      updatedAt: treatmentsData?.updated_at ? new Date(treatmentsData.updated_at).getTime() : now(),
      patientId,
      // Eksik alanları fallback ile tamamla
      teeth: Array.isArray(treatmentsJson.teeth) ? treatmentsJson.teeth : [],
    };

    const teethMap = new Map((result.teeth || []).map((tooth) => {
      const toothId = String(tooth?.toothId || "").trim();
      const procedures = Array.isArray(tooth?.procedures) ? tooth.procedures : [];
      const diagnosis = Array.isArray(tooth?.diagnosis) ? tooth.diagnosis : [];
      return [toothId, { ...tooth, toothId, procedures, diagnosis }];
    }));

    const visits = [];
    const diagnoses = [];

    const normalizeProcedureStatus = (rawStatus) => {
      const status = String(rawStatus || "PLANNED").trim().toUpperCase();
      if (status === "DONE" || status === "COMPLETED" || status === "COMPLETE") return "COMPLETED";
      if (status === "IN_PROGRESS" || status === "ONGOING") return "ACTIVE";
      if (status === "CANCELLED") return "CANCELLED";
      if (status === "ACTIVE") return "ACTIVE";
      return "PLANNED";
    };

    const ensureTooth = (rawToothId) => {
      const toothId = String(rawToothId || "").trim();
      if (!toothId) return null;
      if (!teethMap.has(toothId)) {
        teethMap.set(toothId, { toothId, procedures: [], diagnosis: [] });
      }
      return teethMap.get(toothId);
    };

    // Merge doctor-entered encounter diagnoses + treatment items
    try {
      const encounterQuery = await supabase
        .from("patient_encounters")
        .select("id, encounter_type, status, created_at, updated_at")
        .eq("patient_id", patientUuid)
        .order("created_at", { ascending: false })
        .limit(300);

      const encounterRows = encounterQuery.error ? [] : (encounterQuery.data || []);
      const encounterIdToVisitId = new Map();

      for (const encounter of encounterRows) {
        const encounterId = String(encounter?.id || "").trim();
        if (!encounterId) continue;
        const visitId = `encounter-${encounterId}`;
        encounterIdToVisitId.set(encounterId, visitId);

        visits.push({
          id: visitId,
          visit_date: encounter?.created_at || encounter?.updated_at || null,
          created_at: encounter?.created_at || null,
          updated_at: encounter?.updated_at || encounter?.created_at || null,
          notes: encounter?.encounter_type ? `Encounter: ${String(encounter.encounter_type).toUpperCase()}` : "Doctor Encounter",
          status: encounter?.status || null,
        });
      }

      const encounterIds = Array.from(encounterIdToVisitId.keys());

      if (encounterIds.length > 0) {
        const encounterDiagnosesQuery = await supabase
          .from("encounter_diagnoses")
          .select("id, encounter_id, icd10_code, icd10_description, tooth_number, notes, created_at")
          .in("encounter_id", encounterIds)
          .order("created_at", { ascending: false });

        if (!encounterDiagnosesQuery.error) {
          for (const diagnosisRow of encounterDiagnosesQuery.data || []) {
            const visitId = encounterIdToVisitId.get(String(diagnosisRow?.encounter_id || "").trim()) || null;
            if (!visitId) continue;

            const toothNumber = diagnosisRow?.tooth_number ?? null;
            diagnoses.push({
              id: `encdiag-${diagnosisRow?.id || Math.random().toString(36).slice(2)}`,
              visit_id: visitId,
              icd10_code: diagnosisRow?.icd10_code || null,
              icd10_description: diagnosisRow?.icd10_description || diagnosisRow?.notes || null,
              tooth_number: toothNumber,
              created_at: diagnosisRow?.created_at || null,
            });

            if (toothNumber !== null && toothNumber !== undefined && String(toothNumber).trim()) {
              const tooth = ensureTooth(toothNumber);
              if (tooth) {
                const code = String(diagnosisRow?.icd10_code || "").trim();
                const description = String(diagnosisRow?.icd10_description || diagnosisRow?.notes || "").trim();
                const exists = tooth.diagnosis.some((item) => {
                  const existingCode = String(item?.code || item?.icd10_code || "").trim();
                  const existingDescription = String(item?.description || item?.icd10_description || "").trim();
                  return existingCode === code && existingDescription === description;
                });
                if (!exists && (code || description)) {
                  tooth.diagnosis.push({
                    code: code || null,
                    description: description || null,
                  });
                }
              }
            }
          }
        }

        const plansQuery = await supabase
          .from("treatment_plans")
          .select("id, encounter_id, status, created_at")
          .in("encounter_id", encounterIds);

        const planRows = plansQuery.error ? [] : (plansQuery.data || []);
        const planIds = planRows.map((row) => String(row?.id || "").trim()).filter(Boolean);

        if (planIds.length > 0) {
          const selectCandidates = [
            "id, treatment_plan_id, tooth_fdi_code, tooth_number, tooth_id, procedure_code, procedure_name, procedure_description, status, created_at, updated_at, scheduled_at, scheduled_date",
            "id, treatment_plan_id, tooth_fdi_code, tooth_number, procedure_code, procedure_name, status, created_at, updated_at",
            "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, created_at",
          ];

          let itemRows = [];
          for (const selectClause of selectCandidates) {
            const itemQuery = await supabase
              .from("treatment_items")
              .select(selectClause)
              .in("treatment_plan_id", planIds);

            if (!itemQuery.error) {
              itemRows = itemQuery.data || [];
              break;
            }

            const code = String(itemQuery.error?.code || "");
            if (!["42703", "PGRST204"].includes(code)) {
              break;
            }
          }

          for (const item of itemRows) {
            const rawToothId = item?.tooth_fdi_code || item?.tooth_number || item?.tooth_id;
            const tooth = ensureTooth(rawToothId);
            if (!tooth) continue;

            const procedureId = String(item?.id || "").trim() || `tp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const exists = tooth.procedures.some((proc) => String(proc?.procedureId || proc?.id || "") === procedureId);
            if (exists) continue;

            const typeRaw = item?.procedure_code || item?.procedure_name || item?.procedure_description || "TREATMENT";
            const normalizedType = String(typeRaw || "TREATMENT").trim().toUpperCase();

            tooth.procedures.push({
              id: procedureId,
              procedureId,
              type: normalizedType,
              category: "EVENTS",
              status: normalizeProcedureStatus(item?.status),
              scheduledAt: item?.scheduled_at || item?.scheduled_date || null,
              date: item?.scheduled_date || item?.scheduled_at || null,
              notes: String(item?.procedure_description || "").trim(),
              createdAt: item?.created_at || item?.updated_at || now(),
              meta: {},
            });
          }
        }
      }
    } catch (mergeError) {
      console.error("[TREATMENTS GET] merge from encounters/treatment_plans failed:", mergeError);
    }

    result.teeth = Array.from(teethMap.values()).filter((tooth) => String(tooth?.toothId || "").trim());
    result.visits = Array.isArray(result.visits) && result.visits.length ? result.visits : visits;
    result.diagnoses = Array.isArray(result.diagnoses) && result.diagnoses.length ? result.diagnoses : diagnoses;

    res.json(result);
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("Treatments GET error:", err);
    res.status(500).json({ ok: false, error: "treatments_fetch_failed", details: err.message });
  }
});

app.get("/api/patient/treatment-plan/:patientId", getUserFromToken, requirePatient, async (req, res) => {
  try {
    const requestedPatientId = String(req.params.patientId || "").trim();
    if (!requestedPatientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const tokenPatientId = String(req.user?.raw?.patientId || req.user?.id || "").trim();
    if (!tokenPatientId || tokenPatientId !== requestedPatientId) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const clinicId = req.user?.clinicId || null;

    let patient = null;
    const lookupCandidates = [
      { column: "id", value: requestedPatientId },
      { column: "patient_id", value: requestedPatientId },
      { column: "name", value: requestedPatientId },
    ];

    for (const candidate of lookupCandidates) {
      const baseQuery = supabase
        .from("patients")
        .select("id, patient_id, name, clinic_id")
        .eq(candidate.column, candidate.value)
        .limit(1)
        .maybeSingle();

      const { data, error } = clinicId
        ? await baseQuery.eq("clinic_id", clinicId)
        : await baseQuery;

      if (error) {
        console.error("PATIENT_VIEW_PLAN_PATIENT_LOOKUP_ERROR:", error);
        return res.status(500).json({ ok: false, error: "internal_error" });
      }

      if (data) {
        patient = data;
        break;
      }
    }

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const { data: plans, error: plansError } = await supabase
      .from("treatment_plans")
      .select(`
        id,
        status,
        encounter_id,
        created_at,
        updated_at,
        patient_encounters!inner(
          id,
          patient_id
        )
      `)
      .eq("patient_encounters.patient_id", patient.id)
      .neq("status", "DRAFT")
      .order("created_at", { ascending: false });

    if (plansError) {
      console.error("PATIENT_VIEW_PLAN_ERROR:", plansError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const encounterIds = Array.from(new Set((plans || []).map((plan) => plan.encounter_id).filter(Boolean)));
    const planIds = (plans || []).map((plan) => plan.id);

    const diagnosesByEncounter = new Map();
    if (encounterIds.length > 0) {
      const { data: diagnoses, error: diagnosesError } = await supabase
        .from("encounter_diagnoses")
        .select("id, encounter_id, icd10_code, icd10_description, is_primary, tooth_number, created_at")
        .in("encounter_id", encounterIds)
        .order("created_at", { ascending: false });

      if (!diagnosesError) {
        for (const diagnosis of diagnoses || []) {
          if (!diagnosesByEncounter.has(diagnosis.encounter_id)) {
            diagnosesByEncounter.set(diagnosis.encounter_id, []);
          }
          diagnosesByEncounter.get(diagnosis.encounter_id).push(diagnosis);
        }
      }
    }

    const proceduresByPlan = new Map();
    if (planIds.length > 0) {
      const { data: procedures, error: proceduresError } = await supabase
        .from("procedures")
        .select("id, treatment_plan_id, title, status, scheduled_date, completed_at")
        .in("treatment_plan_id", planIds)
        .order("scheduled_date", { ascending: true });

      if (proceduresError) {
        const { data: treatmentItems, error: treatmentItemsError } = await supabase
          .from("treatment_items")
          .select("id, treatment_plan_id, procedure_name, procedure_code, status, created_at")
          .in("treatment_plan_id", planIds)
          .order("created_at", { ascending: true });

        if (!treatmentItemsError) {
          for (const item of treatmentItems || []) {
            if (!proceduresByPlan.has(item.treatment_plan_id)) {
              proceduresByPlan.set(item.treatment_plan_id, []);
            }
            proceduresByPlan.get(item.treatment_plan_id).push({
              id: item.id,
              title: item.procedure_name || item.procedure_code || "Procedure",
              status: String(item.status || "PLANNED").toUpperCase(),
              scheduled_date: item.created_at || null,
              completed_at: null,
            });
          }
        }
      } else {
        for (const proc of procedures || []) {
          if (!proceduresByPlan.has(proc.treatment_plan_id)) {
            proceduresByPlan.set(proc.treatment_plan_id, []);
          }
          proceduresByPlan.get(proc.treatment_plan_id).push(proc);
        }
      }
    }

    const formattedPlans = (plans || []).map((plan) => {
      const encounterDiagnoses = diagnosesByEncounter.get(plan.encounter_id) || [];
      const primaryDiagnosis = encounterDiagnoses.find((d) => d.is_primary) || encounterDiagnoses[0] || null;

      return {
        id: plan.id,
        status: String(plan.status || "").toUpperCase(),
        created_at: plan.created_at,
        updated_at: plan.updated_at,
        diagnosis: primaryDiagnosis
          ? {
              id: primaryDiagnosis.id,
              code: primaryDiagnosis.icd10_code,
              title: primaryDiagnosis.icd10_description,
              tooth_number: primaryDiagnosis.tooth_number || null,
            }
          : null,
        procedures: proceduresByPlan.get(plan.id) || [],
      };
    });

    return res.json({ ok: true, plans: formattedPlans });
  } catch (error) {
    console.error("PATIENT_VIEW_PLAN_ERROR:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.get("/api/patient/history/:patientId", getUserFromToken, requirePatient, async (req, res) => {
  try {
    const requestedPatientId = String(req.params.patientId || "").trim();
    if (!requestedPatientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const tokenPatientId = String(req.user?.raw?.patientId || req.user?.id || "").trim();
    if (!tokenPatientId || tokenPatientId !== requestedPatientId) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const clinicId = req.user?.clinicId || null;

    let patient = null;
    const lookupCandidates = [
      { column: "id", value: requestedPatientId },
      { column: "patient_id", value: requestedPatientId },
      { column: "name", value: requestedPatientId },
    ];

    for (const candidate of lookupCandidates) {
      const baseQuery = supabase
        .from("patients")
        .select("id, patient_id, name, clinic_id")
        .eq(candidate.column, candidate.value)
        .limit(1)
        .maybeSingle();

      const { data, error } = clinicId
        ? await baseQuery.eq("clinic_id", clinicId)
        : await baseQuery;

      if (error) {
        console.error("PATIENT_HISTORY_PATIENT_LOOKUP_ERROR:", error);
        return res.status(500).json({ ok: false, error: "internal_error" });
      }

      if (data) {
        patient = data;
        break;
      }
    }

    if (!patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const { data: encounters, error: encountersError } = await supabase
      .from("patient_encounters")
      .select("id, patient_id, encounter_type, status, created_at")
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false });

    if (encountersError) {
      console.error("PATIENT_HISTORY_ENCOUNTERS_ERROR:", encountersError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const encounterIds = Array.from(new Set((encounters || []).map((item) => item.id).filter(Boolean)));

    let diagnoses = [];
    if (encounterIds.length > 0) {
      const { data: diagnosesData, error: diagnosesError } = await supabase
        .from("encounter_diagnoses")
        .select("id, encounter_id, icd10_code, icd10_description, tooth_number, notes, is_primary, created_at")
        .in("encounter_id", encounterIds)
        .order("created_at", { ascending: false });

      if (diagnosesError) {
        console.error("PATIENT_HISTORY_DIAGNOSES_ERROR:", diagnosesError);
      } else {
        diagnoses = diagnosesData || [];
      }
    }

    let procedures = [];
    if (encounterIds.length > 0) {
      const { data: plans, error: plansError } = await supabase
        .from("treatment_plans")
        .select("id, encounter_id, status")
        .in("encounter_id", encounterIds)
        .neq("status", "DRAFT");

      if (!plansError) {
        const planIds = (plans || []).map((item) => item.id);
        if (planIds.length > 0) {
          const { data: procedureData, error: procedureError } = await supabase
            .from("procedures")
            .select("id, treatment_plan_id, title, status, scheduled_date, completed_at, created_at")
            .in("treatment_plan_id", planIds)
            .order("created_at", { ascending: false });

          if (procedureError) {
            const { data: treatmentItems, error: treatmentItemsError } = await supabase
              .from("treatment_items")
              .select("id, treatment_plan_id, procedure_name, procedure_code, status, created_at")
              .in("treatment_plan_id", planIds)
              .order("created_at", { ascending: false });

            if (!treatmentItemsError) {
              procedures = (treatmentItems || []).map((item) => ({
                id: item.id,
                treatment_plan_id: item.treatment_plan_id,
                title: item.procedure_name || item.procedure_code || "Procedure",
                status: String(item.status || "PLANNED").toUpperCase(),
                scheduled_date: item.created_at || null,
                completed_at: null,
                created_at: item.created_at || null,
              }));
            }
          } else {
            procedures = procedureData || [];
          }
        }
      }
    }

    const events = [];

    for (const encounter of encounters || []) {
      events.push({
        id: `encounter-${encounter.id}`,
        type: "ENCOUNTER",
        happened_at: encounter.created_at,
        title: "Muayene açıldı",
        description: `Tür: ${String(encounter.encounter_type || "initial").toUpperCase()}`,
        tooth_number: null,
        status: String(encounter.status || "ACTIVE").toUpperCase(),
      });
    }

    for (const diagnosis of diagnoses) {
      events.push({
        id: `diagnosis-${diagnosis.id}`,
        type: "DIAGNOSIS",
        happened_at: diagnosis.created_at,
        title: `${diagnosis.icd10_code || "ICD"} - ${diagnosis.icd10_description || "Tanı"}`,
        description: diagnosis.notes || null,
        tooth_number: diagnosis.tooth_number || null,
        status: diagnosis.is_primary ? "PRIMARY" : "SECONDARY",
      });
    }

    for (const procedure of procedures) {
      events.push({
        id: `procedure-${procedure.id}`,
        type: "PROCEDURE",
        happened_at: procedure.completed_at || procedure.scheduled_date || procedure.created_at || null,
        title: procedure.title || "Procedure",
        description: null,
        tooth_number: null,
        status: String(procedure.status || "PLANNED").toUpperCase(),
      });
    }

    events.sort((a, b) => {
      const left = a.happened_at ? new Date(a.happened_at).getTime() : 0;
      const right = b.happened_at ? new Date(b.happened_at).getTime() : 0;
      return right - left;
    });

    return res.json({
      ok: true,
      patient: {
        id: patient.id,
        patient_id: patient.patient_id,
        name: patient.name,
      },
      timeline: events,
    });
  } catch (error) {
    console.error("PATIENT_HISTORY_ERROR:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
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
    const decodedRole = decoded.role;
    
    const hasPatientId = decodedPatientId !== null && decodedPatientId !== undefined && String(decodedPatientId || "").trim() !== "";
    const hasClinicCode = decodedClinicCode !== null && decodedClinicCode !== undefined;
    const hasClinicId = decodedClinicId !== null && decodedClinicId !== undefined;
    
    // Check if actor header is "admin" (case-insensitive and trimmed)
    const isAdminByActor = String(actor || "").toLowerCase().trim() === "admin";
    // Check if token is admin token (has clinicCode/clinicId but NO patientId)
    const isAdminByToken = hasClinicCode && hasClinicId && !hasPatientId;
    const isAdmin = isAdminByActor || isAdminByToken;
    const isDoctor = decodedRole === "DOCTOR";
    
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
    } else if (isDoctor) {
      // 🔐 PRIMARY DOCTOR CHECK
      clinicId = decodedClinicId;
      const doctorId = decoded.doctorId || decodedPatientId;
      
      // Get patient and verify primary doctor
      const { data: patient, error } = await supabase
        .from("patients")
        .select("id, primary_doctor_id, name")
        .eq("id", patientId)
        .single();

      if (error || !patient) {
        return res.status(404).json({ ok: false, error: "patient_not_found" });
      }

      if (patient.primary_doctor_id !== doctorId) {
        return res.status(403).json({
          ok: false,
          error: "not_primary_doctor",
          message: "Bu hastanın primary doktoru değilsiniz."
        });
      }

      patientUuid = patient.id;
      console.log("[TREATMENTS POST] Doctor access granted:", { 
        patientId, 
        patientUuid, 
        clinicId,
        doctorId,
        patientName: patient.name
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
    console.error("Treatments POST - Exception:", err);
    res.status(500).json({ ok: false, error: "treatments_save_exception", details: err.message });
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
    console.error("Treatments DELETE - Exception:", err);
    res.status(500).json({ ok: false, error: "treatments_delete_exception", details: err.message });
  }
});

/* ================= TRAVEL (GET) ================= */
app.get("/api/patient/:patientId/travel", async (req, res) => {
  // Get token for patientId extraction
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

  // Decode token to get patientId and role
  let decoded;
  try {
    decoded = jwt.decode(authToken);
    if (!decoded) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  } catch (error) {
    console.error("Travel GET - Token decode error:", error);
    return res.status(401).json({ ok: false, error: "token_decode_failed" });
  }

  // Role-based patientId extraction
  let patientId;
  
  if (decoded.role === "PATIENT") {
    // PATIENT role: Extract patientId from JWT only
    patientId = decoded.patientId;
    
    // Validate patientId exists in token
    if (!patientId) {
      console.error("Travel GET - PATIENT token missing patientId:", decoded);
      return res.status(400).json({ 
        ok: false, 
        error: "patient_id_required",
        details: "PATIENT token must contain patientId"
      });
    }
    
    console.log("Travel GET - PATIENT access:", { 
      patientId,
      role: decoded.role,
      actor
    });
    
  } else if (decoded.role === "ADMIN" || decoded.role === "DOCTOR") {
    // ADMIN/DOCTOR role: Use query parameter with validation
    const requestedPatientId = String(req.params.patientId || "").trim();
    
    // Validate requested patientId for admin/doctor
    if (
      !requestedPatientId ||
      requestedPatientId === "undefined" ||
      requestedPatientId === "null" ||
      requestedPatientId === ""
    ) {
      console.error("Travel GET - ADMIN/DOCTOR missing or invalid patientId:", {
        requestedPatientId,
        role: decoded.role,
        actor
      });
      return res.status(400).json({ 
        ok: false, 
        error: "patient_id_required",
        details: "ADMIN/DOCTOR must provide valid patientId parameter"
      });
    }
    
    patientId = requestedPatientId;
    
    console.log("Travel GET - ADMIN/DOCTOR access:", { 
      patientId,
      requestedPatientId,
      role: decoded.role,
      actor,
      clinicId: decoded.clinicId
    });
    
  } else {
    // Unknown role
    console.error("Travel GET - Unknown role:", decoded.role);
    return res.status(403).json({ 
      ok: false, 
      error: "invalid_role",
      details: "Role must be PATIENT, ADMIN, or DOCTOR"
    });
  }

  // Final validation
  if (!patientId) {
    console.error("Travel GET - Invalid patientId after role resolution:", {
      role: decoded.role,
      actor,
      tokenPatientId: decoded.patientId,
      requestedPatientId: req.params.patientId
    });
    return res.status(400).json({ ok: false, error: "invalid_patient_id" });
  }

  try {
    // Verify token
    try {
      decoded = jwt.verify(authToken, JWT_SECRET);
    } catch (err) {
      console.error("Travel GET - Token verification failed:", err.message);
      return res.status(401).json({ ok: false, error: "invalid_token", details: err.message });
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
    console.error("Travel GET error:", err);
    res.status(500).json({ ok: false, error: "travel_fetch_failed", details: err.message });
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
      console.error("[TRAVEL SAVE] Admin token verification failed:", err.message);
      return res.status(401).json({ ok: false, error: "invalid_token", details: err.message });
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
    console.error("Travel SAVE - Exception:", err);
    res.status(500).json({ ok: false, error: "travel_save_exception", details: err.message });
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
    console.error("[AUTH] Token verification failed:", err.message);
    return res.status(401).json({ ok: false, error: "invalid_token", details: err.message });
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

    if (patient.status !== "ACTIVE") {
      console.log(`[CHECK STATUS] Patient ${patientId} status is ${patient.status}, not ACTIVE`);
      return { approved: false, error: "patient_not_approved", status: patient.status };
    }

    return { approved: true, patient };
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[CHECK STATUS] Error checking patient status:", err);
    return { approved: false, error: "status_check_failed", details: err.message };
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
app.get("/api/admin/recent-treatments", adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.clinicId
    const clinicId = req.admin?.clinicId;

    // 🔥 CRITICAL: Add undefined guard
    if (!clinicId) {
      console.error("[RECENT TREATMENTS] Missing clinicId:", { 
        admin: req.admin,
        clinicId: clinicId 
      });
      return res.status(400).json({ 
        ok: false, 
        error: "Missing clinicId" 
      });
    }

    // 🔥 Debug log
    console.log("[RECENT TREATMENTS] clinicId:", clinicId);

    const { data, error } = await supabase
      .from("treatments_v2")
      .select(`
        id,
        type,
        created_at,
        patients:patient_id ( full_name ),
        doctors:doctor_id ( full_name )
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[RECENT TREATMENTS V2] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json(
      data.map(t => ({
        id: t.id,
        createdAt: t.created_at,
        type: t.type || "Treatment",
        patient: { name: t.patients?.full_name || "-" },
        doctor: { name: t.doctors?.full_name || "-" }
      }))
    );

  } catch (err) {
    console.error("[RECENT TREATMENTS V2] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN CREATE TREATMENT V2 ================= */
app.post("/api/admin/treatments-v2", adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.clinicId
    const clinicId = req.admin?.clinicId;
    const { patient_id, doctor_id, type, notes, items } = req.body;

    if (!patient_id) {
      return res.status(400).json({ ok: false, error: "patient_required" });
    }

    // 🔥 CRITICAL: Log request body for debugging
    console.log("[CREATE TREATMENT V2] REQUEST BODY:", req.body);
    console.log("[CREATE TREATMENT V2] PARSED VALUES:", {
      clinicId,
      patient_id,
      doctor_id,
      type,
      notes,
      items
    });

    // 🔥 CRITICAL: Validate UUID formats
    if (!clinicId || !clinicId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[CREATE TREATMENT V2] Invalid clinicId:", clinicId);
      return res.status(400).json({ ok: false, error: "invalid_clinic_id" });
    }

    if (!patient_id || !patient_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[CREATE TREATMENT V2] Invalid patient_id:", patient_id);
      return res.status(400).json({ ok: false, error: "invalid_patient_id" });
    }

    if (!doctor_id || !doctor_id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[CREATE TREATMENT V2] Invalid doctor_id:", doctor_id);
      return res.status(400).json({ ok: false, error: "invalid_doctor_id" });
    }

    // 🔥 CRITICAL: Build payload with explicit values
    const payload = {
      clinic_id: clinicId,
      patient_id: patient_id,
      doctor_id: doctor_id,
      type: type || "general",
      notes: notes || "",
      created_at: new Date().toISOString(), // 🔥 CRITICAL: Explicit created_at
      updated_at: new Date().toISOString()  // 🔥 CRITICAL: Explicit updated_at
    };

    console.log("[CREATE TREATMENT V2] PAYLOAD:", JSON.stringify(payload, null, 2));

    const { data: treatment, error: treatmentError } = await supabase
      .from("treatments_v2")
      .insert([payload]) // 🔥 CRITICAL: Array format
      .select();

    // 🔥 CRITICAL: Log insert results
    console.log("[CREATE TREATMENT V2] INSERT DATA:", JSON.stringify(data, null, 2));
    console.log("[CREATE TREATMENT V2] INSERT ERROR:", JSON.stringify(error, null, 2));

    if (treatmentError) {
      console.error("[CREATE TREATMENT V2] Full Error Details:", {
        message: treatmentError.message,
        details: treatmentError.details,
        hint: treatmentError.hint,
        code: treatmentError.code
      });
      return res.status(500).json({ 
        ok: false, 
        error: treatmentError.message || "creation_failed",
        details: treatmentError
      });
    }

    if (items && items.length > 0) {
      const mappedItems = items.map(i => ({
        treatment_id: treatment.id,
        tooth_number: i.tooth_number,
        procedure_code: i.procedure_code,
        description: i.description,
        price: i.price
      }));

      const { error: itemsError } = await supabase
        .from("treatment_items_v2")
        .insert(mappedItems);

      if (itemsError) {
        console.error("[CREATE TREATMENT ITEMS V2] Error:", itemsError);
      }
    }

    res.json({ ok: true, treatment_id: treatment.id });

  } catch (err) {
    console.error("[CREATE TREATMENT V2] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENTS V2 ================= */
app.get("/api/admin/treatments-v2/:patientId", adminAuth, async (req, res) => {
  try {
    const clinicId = req.clinicId;
    const patientId = req.params.patientId;

    const { data, error } = await supabase
      .from("treatments_v2")
      .select(`
        *,
        patients:patient_id ( full_name ),
        doctors:doctor_id ( full_name ),
        treatment_items_v2 (
          id,
          tooth_number,
          procedure_code,
          description,
          price
        )
      `)
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN TREATMENTS V2 GET] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({ ok: true, treatments: data });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 GET] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/admin/treatments-v2/:patientId", adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.clinicId
    const clinicId = req.admin?.clinicId;
    const patientId = req.params.patientId;
    const { type, notes, items } = req.body;

    // 🔥 CRITICAL: Log request body for debugging
    console.log("[ADMIN TREATMENTS V2 POST] REQUEST BODY:", req.body);
    console.log("[ADMIN TREATMENTS V2 POST] PARSED VALUES:", {
      clinicId,
      patientId,
      type,
      notes,
      items
    });

    // 🔥 CRITICAL: Validate UUID formats
    if (!clinicId || !clinicId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[ADMIN TREATMENTS V2 POST] Invalid clinicId:", clinicId);
      return res.status(400).json({ ok: false, error: "invalid_clinic_id" });
    }

    if (!patientId || !patientId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      console.error("[ADMIN TREATMENTS V2 POST] Invalid patientId:", patientId);
      return res.status(400).json({ ok: false, error: "invalid_patient_id" });
    }

    // 🔥 CRITICAL: Build payload with explicit values
    const payload = {
      clinic_id: clinicId,
      patient_id: patientId,
      type: type || "general",
      notes: notes || "",
      created_at: new Date().toISOString(), // 🔥 CRITICAL: Explicit created_at
      updated_at: new Date().toISOString()  // 🔥 CRITICAL: Explicit updated_at
    };

    console.log("[ADMIN TREATMENTS V2 POST] PAYLOAD:", JSON.stringify(payload, null, 2));

    const { data: treatment, error: treatmentError } = await supabase
      .from("treatments_v2")
      .insert([payload]) // 🔥 CRITICAL: Array format
      .select();

    // 🔥 CRITICAL: Log insert results
    console.log("[ADMIN TREATMENTS V2 POST] INSERT DATA:", JSON.stringify(data, null, 2));
    console.log("[ADMIN TREATMENTS V2 POST] INSERT ERROR:", JSON.stringify(error, null, 2));

    if (treatmentError) {
      console.error("[ADMIN TREATMENTS V2 POST] Full Error Details:", {
        message: treatmentError.message,
        details: treatmentError.details,
        hint: treatmentError.hint,
        code: treatmentError.code
      });
      return res.status(500).json({ 
        ok: false, 
        error: treatmentError.message || "creation_failed",
        details: treatmentError
      });
    }

    if (items && items.length > 0) {
      const mappedItems = items.map(i => ({
        treatment_id: treatment.id,
        tooth_number: i.tooth_number,
        procedure_code: i.procedure_code,
        description: i.description,
        price: i.price
      }));

      const { error: itemsError } = await supabase
        .from("treatment_items_v2")
        .insert(mappedItems);

      if (itemsError) {
        console.error("[ADMIN TREATMENTS ITEMS V2 POST] Error:", itemsError);
      }
    }

    res.json({ ok: true, treatment });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 POST] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.put("/api/admin/treatments-v2/:treatmentId", adminAuth, async (req, res) => {
  try {
    const clinicId = req.clinicId;
    const treatmentId = req.params.treatmentId;
    const { type, notes, items } = req.body;

    const { data: treatment, error: treatmentError } = await supabase
      .from("treatments_v2")
      .update({ type, notes })
      .eq("id", treatmentId)
      .eq("clinic_id", clinicId)
      .select()
      .single();

    if (treatmentError) {
      console.error("[ADMIN TREATMENTS V2 PUT] Error:", treatmentError);
      return res.status(500).json({ ok: false, error: "update_failed" });
    }

    // Update items if provided
    if (items && items.length > 0) {
      // Delete existing items
      await supabase
        .from("treatment_items_v2")
        .delete()
        .eq("treatment_id", treatmentId);

      // Insert new items
      const mappedItems = items.map(i => ({
        treatment_id: treatmentId,
        tooth_number: i.tooth_number,
        procedure_code: i.procedure_code,
        description: i.description,
        price: i.price
      }));

      const { error: itemsError } = await supabase
        .from("treatment_items_v2")
        .insert(mappedItems);

      if (itemsError) {
        console.error("[ADMIN TREATMENTS ITEMS V2 PUT] Error:", itemsError);
      }
    }

    res.json({ ok: true, treatment });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 PUT] Fatal:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.delete("/api/admin/treatments-v2/:treatmentId", adminAuth, async (req, res) => {
  try {
    const clinicId = req.clinicId;
    const treatmentId = req.params.treatmentId;

    // Delete treatment items first
    await supabase
      .from("treatment_items_v2")
      .delete()
      .eq("treatment_id", treatmentId);

    // Delete treatment
    const { error } = await supabase
      .from("treatments_v2")
      .delete()
      .eq("id", treatmentId)
      .eq("clinic_id", clinicId);

    if (error) {
      console.error("[ADMIN TREATMENTS V2 DELETE] Error:", error);
      return res.status(500).json({ ok: false, error: "delete_failed" });
    }

    res.json({ ok: true, deleted: true });

  } catch (err) {
    console.error("[ADMIN TREATMENTS V2 DELETE] Fatal:", err);
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
      .eq("status", "ACTIVE")
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
        .eq("status", "ACTIVE")
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

    console.log("[ADMIN LOGIN] Request received:", { email, clinicCode, hasPassword: !!password });

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

    const isBcryptHash = (value) => typeof value === "string" && /^\$2[aby]\$/.test(value);
    const checkPassword = async (plain, stored) => {
      if (!stored || typeof stored !== "string") return false;
      if (isBcryptHash(stored)) {
        try {
          return await bcrypt.compare(plain, stored);
        } catch {
          return false;
        }
      }
      return stored === plain;
    };

    let clinic = null;
    let identity = null;

    const { data: admin, error: adminError } = await supabase
      .from("admins")
      .select("id, email, clinic_code, password_hash, status, name")
      .eq("email", trimmedEmail)
      .eq("clinic_code", trimmedClinicCode)
      .maybeSingle();

    if (!adminError && admin) {
      const adminStatus = String(admin.status || "ACTIVE").toUpperCase();
      if (adminStatus !== "ACTIVE") {
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      const passwordMatch = await checkPassword(trimmedPassword, admin.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      const { data: clinicByCode } = await supabase
        .from("clinics")
        .select("id, clinic_code, name, email")
        .eq("clinic_code", trimmedClinicCode)
        .maybeSingle();

      clinic = clinicByCode || null;
      identity = {
        id: admin.id,
        email: admin.email,
        name: admin.name || clinic?.name || "",
        clinicId: clinic?.id || null,
        clinicCode: trimmedClinicCode,
      };
    } else {
      const { data: clinicRow, error: clinicError } = await supabase
        .from("clinics")
        .select("id, clinic_code, name, email, password_hash")
        .eq("clinic_code", trimmedClinicCode)
        .maybeSingle();

      if (clinicError || !clinicRow) {
        console.error("[ADMIN LOGIN] Clinic lookup failed:", clinicError);
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      if (String(clinicRow.email || "").trim().toLowerCase() !== trimmedEmail) {
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      const passwordMatch = await checkPassword(trimmedPassword, clinicRow.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      clinic = clinicRow;
      identity = {
        id: clinicRow.id,
        email: clinicRow.email,
        name: clinicRow.name || "",
        clinicId: clinicRow.id,
        clinicCode: trimmedClinicCode,
      };
    }

    if (!identity || !identity.clinicId) {
      return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
    }

    // JWT token oluştur
    const token = jwt.sign(
      {
        adminId: identity.id,
        role: "ADMIN",
        clinicId: identity.clinicId,
        clinicCode: trimmedClinicCode
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("[ADMIN LOGIN] Token generated successfully for admin:", identity.email);

    res.json({
      ok: true,
      user: {
        id: identity.id,
        token: token,
        type: "admin",
        role: "ADMIN",
        email: identity.email,
        name: identity.name,
        clinicId: identity.clinicId,
        clinicCode: clinic?.clinic_code || identity.clinicCode
      }
    });
  } catch (err) {
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
      .select("id, patient_id, name, phone, status, clinic_id, clinic_code, role")
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

    if (clinicError || !clinic) {
      console.error("[PATIENT LOGIN] Clinic lookup error:", clinicError);
      return res.status(500).json({ ok: false, error: "internal_error", message: "Clinic lookup failed" });
    }

    const stablePatientId = patient.patient_id || patient.id;

    // JWT token oluştur (register endpoint ile aynı format)
    const token = jwt.sign(
      { 
        patientId: stablePatientId,
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
      user: {
        id: stablePatientId,
        token: token,
        type: "patient",
        role: patient.role || "PATIENT",
        name: patient.name || "",
        email: "", // Patients don't have email
        phone: patient.phone || "",
        patientId: stablePatientId,
        clinicId: patient.clinic_id,
        clinicCode: clinic.clinic_code || "",
        status: patient.status || "PENDING"
      }
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[PATIENT LOGIN] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error", message: err.message });
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
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.clinicId
    const clinicId = req.admin?.clinicId;

    // 🔥 CRITICAL: Add undefined guard
    if (!clinicId) {
      console.error("[ADMIN CLINIC] Missing clinicId:", { 
        admin: req.admin,
        clinicId: clinicId 
      });
      return res.status(400).json({ 
        ok: false, 
        error: "Missing clinicId" 
      });
    }

    // 🔥 Debug log
    console.log("[ADMIN CLINIC] clinicId:", clinicId);

    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("id", clinicId)
      .single();

    if (error || !clinic) {
      console.error("[ADMIN CLINIC] Clinic not found:", { clinicId, error });
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

    // Patient count hesapla
    const { count: patientCount, error: countError } = await supabase
      .from("patients")
      .select("*", { count: "exact", head: true })
      .eq("clinic_id", clinicId);

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

/* ================= ADMIN MESSAGES UNREAD COUNTS (sidebar badge) ================= */
app.get("/api/admin/messages/unread-counts", adminAuth, async (req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-cache, must-revalidate");
    const clinicId = req.admin?.clinicId;
    const clinicCode = String(req.admin?.clinicCode || "").trim().toUpperCase();
    const totalOnly = String(req.query.totalOnly || req.query.summary || "").trim() === "1";
    if (!clinicId && !clinicCode) {
      return res.json({ ok: true, total: 0, counts: {} });
    }
    if (!totalOnly) {
      return res.json({ ok: true, total: 0, counts: {} });
    }
    for (const [field, value] of [
      ["clinic_code", clinicCode],
      ["clinic_id", clinicId],
    ]) {
      if (!value) continue;
      for (const unreadOnly of [true, false]) {
        let q = supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("from_patient", true)
          .eq(field, value);
        if (unreadOnly) q = q.is("read_at", null);
        const r = await q;
        if (!r.error) {
          return res.json({ ok: true, total: r.count || 0, counts: {} });
        }
        const code = String(r.error?.code || "");
        const msg = String(r.error?.message || "").toLowerCase();
        if (unreadOnly && (msg.includes("read_at") || msg.includes("column"))) continue;
        if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) continue;
        break;
      }
    }
    return res.json({ ok: true, total: 0, counts: {} });
  } catch (e) {
    console.error("[UNREAD COUNTS]", e?.message || e);
    return res.json({ ok: true, total: 0, counts: {} });
  }
});

/* ================= ADMIN EVENTS (GET) ================= */
app.get("/api/admin/events", adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin?.clinicId || req.clinicId;
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const todayEndTs = todayEnd.getTime();

    const allEvents = [];

    const toIso = (value) => {
      if (!value) return null;
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
      }
      const num = Number(value);
      if (!Number.isFinite(num)) return null;
      return new Date(num).toISOString();
    };

    const dateTimeToIso = (dateStr, timeStr) => {
      if (!dateStr) return null;
      const hhmm = String(timeStr || "00:00").slice(0, 5);
      const candidate = `${dateStr}T${hhmm}:00`;
      const parsed = Date.parse(candidate);
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    };

    const normalizeStatus = (status) => {
      const raw = String(status || "PLANNED").trim().toUpperCase();
      if (!raw) return "PLANNED";
      if (["DONE", "COMPLETED", "COMPLETE", "FINISHED"].includes(raw)) return "COMPLETED";
      if (["CANCELLED", "CANCELED"].includes(raw)) return "CANCELLED";
      if (["ACTIVE", "IN_PROGRESS", "ONGOING"].includes(raw)) return "ACTIVE";
      return raw;
    };

    const normalizeText = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const normalized = text.toLowerCase();
      if (["unknown", "unknown unknown", "unknown patient", "null", "undefined", "n/a", "na", "-", "--"].includes(normalized)) {
        return "";
      }
      return text;
    };

    const addEvent = (evt) => {
      const iso = evt.timelineAt || dateTimeToIso(evt.date, evt.time) || toIso(evt.timestamp);
      if (!iso) return;
      const ts = Date.parse(iso);
      if (!Number.isFinite(ts)) return;
      allEvents.push({
        ...evt,
        timelineAt: iso,
        timestamp: ts,
      });
    };

    const patientSelectCandidates = [
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, doctor_id, travel, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, doctor_id, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, doctor_id, travel, treatments",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, doctor_id, treatment_events",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, doctor_id, treatments",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, doctor_id",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, travel, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, travel, treatments",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, treatment_events",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id, treatments",
      "id, patient_id, clinic_id, name, full_name, primary_doctor_id",
      "id, patient_id, clinic_id, name, full_name, doctor_id, travel, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, doctor_id, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, doctor_id, travel, treatments",
      "id, patient_id, clinic_id, name, full_name, doctor_id, treatment_events",
      "id, patient_id, clinic_id, name, full_name, doctor_id, treatments",
      "id, patient_id, clinic_id, name, full_name, doctor_id",
      "id, patient_id, clinic_id, name, full_name, travel, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, treatments, treatment_events",
      "id, patient_id, clinic_id, name, full_name, travel, treatments",
      "id, patient_id, clinic_id, name, full_name, treatment_events",
      "id, patient_id, clinic_id, name, full_name, treatments",
      "id, patient_id, clinic_id, name, full_name",
    ];

    let patients = [];
    for (const selectClause of patientSelectCandidates) {
      const result = await supabase
        .from("patients")
        .select(selectClause)
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false });

      if (!result.error) {
        patients = Array.isArray(result.data) ? result.data : [];
        break;
      }

      const code = String(result.error.code || "");
      if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
        console.error("[ADMIN EVENTS] patients query failed", result.error);
        break;
      }
    }

    const doctorIdSet = new Set();
    patients.forEach((row) => {
      const doctorId = String(row?.primary_doctor_id || row?.doctor_id || "").trim();
      if (doctorId) doctorIdSet.add(doctorId);
    });

    const doctorNameById = new Map();
    if (doctorIdSet.size > 0) {
      const doctorIds = Array.from(doctorIdSet);
      const doctorSelectCandidates = [
        "id, doctor_id, name, full_name",
        "id, doctor_id, full_name",
        "id, doctor_id, name",
      ];

      for (const selectClause of doctorSelectCandidates) {
        const result = await supabase
          .from("doctors")
          .select(selectClause)
          .or(`id.in.(${doctorIds.join(",")}),doctor_id.in.(${doctorIds.join(",")})`);

        if (!result.error) {
          (result.data || []).forEach((doc) => {
            const keyA = String(doc?.id || "").trim();
            const keyB = String(doc?.doctor_id || "").trim();
            const label = normalizeText(doc?.name) || normalizeText(doc?.full_name) || keyB || keyA;
            if (keyA && label) doctorNameById.set(keyA, label);
            if (keyB && label) doctorNameById.set(keyB, label);
          });
          break;
        }

        const code = String(result.error?.code || "");
        if (!["42703", "PGRST204", "PGRST205", "42P01"].includes(code)) {
          console.error("[ADMIN EVENTS] doctors query failed", result.error);
          break;
        }
      }
    }

    for (const p of patients) {
      const patientId = String(p?.patient_id || p?.id || "").trim();
      if (!patientId) continue;
      const first = normalizeText(p?.first_name);
      const last = normalizeText(p?.last_name);
      const merged = normalizeText(`${first} ${last}`.trim());
      const patientName = normalizeText(p?.name) || normalizeText(p?.full_name) || merged || patientId;
      const patientDoctorId = String(p?.primary_doctor_id || p?.doctor_id || "").trim();
      const patientDoctorName = String(doctorNameById.get(patientDoctorId) || "").trim();
      const patientLookupIds = [String(p?.id || "").trim(), String(p?.patient_id || "").trim()].filter(Boolean);

      const travel = p?.travel || {};
      if (Array.isArray(travel?.events)) {
        travel.events.forEach((eventItem) => {
          addEvent({
            id: eventItem?.id || `travel_${patientId}_${eventItem?.date || ""}_${eventItem?.time || ""}`,
            patientId,
            patientName,
            type: "TRAVEL_EVENT",
            eventType: eventItem?.type || "TRAVEL",
            title: eventItem?.title || "Travel Event",
            description: eventItem?.desc || "",
            date: eventItem?.date,
            time: eventItem?.time || "",
            status: "PLANNED",
            source: "travel",
          });
        });
      }

      let treatments = p?.treatments || {};
      if (!treatments || typeof treatments !== "object") treatments = {};
      const teeth = Array.isArray(treatments?.teeth) ? treatments.teeth : [];
      teeth.forEach((tooth) => {
        const toothId = tooth?.toothId ?? tooth?.tooth_id ?? tooth?.toothNumber ?? tooth?.tooth_number;
        const procedures = Array.isArray(tooth?.procedures) ? tooth.procedures : [];
        procedures.forEach((proc) => {
          const timelineAt = toIso(proc?.scheduledAt) || toIso(proc?.createdAt) || toIso(proc?.timestamp);
          if (!timelineAt) return;
          const procedureDoctorId = String(
            proc?.assignedDoctorId ||
            proc?.assigned_doctor_id ||
            proc?.doctorId ||
            proc?.doctor_id ||
            proc?.meta?.doctorId ||
            proc?.meta?.doctor_id ||
            ""
          ).trim();
          const procedureDoctorName =
            normalizeText(proc?.assignedDoctorName) ||
            normalizeText(proc?.doctorName) ||
            normalizeText(proc?.doctor) ||
            normalizeText(doctorNameById.get(procedureDoctorId) || "") ||
            patientDoctorName ||
            "";
          const procedureChair = String(
            proc?.chairNo ||
            proc?.chair_no ||
            proc?.chair ||
            proc?.chairId ||
            proc?.chair_id ||
            proc?.meta?.chairNo ||
            proc?.meta?.chair_no ||
            ""
          ).trim();
          addEvent({
            id: proc?.id || proc?.procedureId || `treatment_${patientId}_${timelineAt}`,
            patientId,
            patientName,
            doctor: procedureDoctorName,
            chair: procedureChair,
            type: "TREATMENT",
            eventType: proc?.type || "PROCEDURE",
            title: `${proc?.type || "Treatment"}${toothId ? ` - Tooth ${toothId}` : ""}`,
            procedureName: proc?.type || proc?.procedureName || proc?.procedure_name || "",
            procedureCode: proc?.procedureCode || proc?.procedure_code || proc?.type || "",
            toothId: toothId ? String(toothId) : undefined,
            date: timelineAt.split("T")[0],
            time: new Date(timelineAt).toTimeString().slice(0, 5),
            status: normalizeStatus(proc?.status || "PLANNED"),
            source: "treatment",
            timelineAt,
          });
        });
      });

      const treatmentEvents = Array.isArray(p?.treatment_events) ? p.treatment_events : [];
      treatmentEvents.forEach((eventItem) => {
        const timelineAt =
          toIso(eventItem?.startAt) ||
          dateTimeToIso(eventItem?.date, eventItem?.time) ||
          toIso(eventItem?.scheduledAt) ||
          toIso(eventItem?.createdAt) ||
          toIso(eventItem?.timestamp);
        if (!timelineAt) return;
        const eventDoctorId = String(
          eventItem?.assignedDoctorId ||
          eventItem?.assigned_doctor_id ||
          eventItem?.doctorId ||
          eventItem?.doctor_id ||
          eventItem?.meta?.doctorId ||
          eventItem?.meta?.doctor_id ||
          ""
        ).trim();
        const eventDoctorName =
          normalizeText(eventItem?.assignedDoctorName) ||
          normalizeText(eventItem?.doctorName) ||
          normalizeText(eventItem?.doctor) ||
          normalizeText(doctorNameById.get(eventDoctorId) || "") ||
          patientDoctorName ||
          "";
        const eventChair = String(
          eventItem?.chairNo ||
          eventItem?.chair_no ||
          eventItem?.chair ||
          eventItem?.chairId ||
          eventItem?.chair_id ||
          ""
        ).trim();
        addEvent({
          id: eventItem?.id || `treatment_event_${patientId}_${timelineAt}`,
          patientId,
          patientName,
          doctor: eventDoctorName,
          chair: eventChair,
          type: "TREATMENT_EVENT",
          eventType: eventItem?.type || "TREATMENT",
          title: eventItem?.title || "Treatment",
          description: eventItem?.desc || eventItem?.description || "",
          date: eventItem?.date || timelineAt.split("T")[0],
          time: eventItem?.time || new Date(timelineAt).toTimeString().slice(0, 5),
          status: normalizeStatus(eventItem?.status || "PLANNED"),
          source: "treatment",
          timelineAt,
        });
      });

      try {
        const encounterResult = await supabase
          .from("patient_encounters")
          .select("id, patient_id")
          .in("patient_id", patientLookupIds)
          .order("created_at", { ascending: false });

        const encounters = Array.isArray(encounterResult.data) ? encounterResult.data : [];
        const encounterIds = encounters.map((row) => String(row?.id || "").trim()).filter(Boolean);
        if (encounterResult.error || encounterIds.length === 0) continue;

        const plansResult = await supabase
          .from("treatment_plans")
          .select("id, encounter_id")
          .in("encounter_id", encounterIds)
          .order("created_at", { ascending: false });

        const plans = Array.isArray(plansResult.data) ? plansResult.data : [];
        const planIds = plans.map((row) => String(row?.id || "").trim()).filter(Boolean);
        if (plansResult.error || planIds.length === 0) continue;

        let itemRows = [];
        for (const tableName of ["treatment_items", "treatment_plan_items"]) {
          const itemsResult = await supabase
            .from(tableName)
            .select("*")
            .in("treatment_plan_id", planIds)
            .order("created_at", { ascending: false });

          if (!itemsResult.error) {
            itemRows = Array.isArray(itemsResult.data) ? itemsResult.data : [];
            if (itemRows.length > 0) break;
            continue;
          }

          const code = String(itemsResult.error.code || "");
          if (!["42703", "PGRST204", "PGRST205", "42P01"].includes(code)) {
            console.error(`[ADMIN EVENTS] ${tableName} query failed`, itemsResult.error);
          }
        }

        itemRows.forEach((item) => {
          const timelineAt =
            toIso(item?.scheduled_at) ||
            toIso(item?.scheduledAt) ||
            toIso(item?.scheduled_date) ||
            toIso(item?.due_date) ||
            toIso(item?.created_at) ||
            toIso(item?.updated_at);
          if (!timelineAt) return;

          const procedureName = String(
            item?.procedure_name || item?.procedure || item?.code || item?.name || item?.procedure_code || "PROCEDURE"
          ).trim();
          const procedureCode = String(item?.procedure_code || procedureName || "PROCEDURE").trim();
          const toothIdRaw = item?.tooth_fdi_code ?? item?.tooth_number ?? item?.tooth_no;
          const upperType = procedureCode.toUpperCase();

          addEvent({
            id: item?.id || `enc_item_${patientId}_${timelineAt}`,
            patientId,
            patientName,
            doctor: normalizeText(item?.doctor_name || item?.doctor) ||
              normalizeText(doctorNameById.get(String(item?.created_by_doctor_id || "").trim()) || "") ||
              patientDoctorName ||
              "",
            chair: String(item?.chair || item?.chair_no || item?.chairNo || ''),
            type: ["CONSULT", "FOLLOWUP", "LAB"].includes(upperType) ? upperType : "TREATMENT",
            eventType: upperType,
            title: `${procedureName}${toothIdRaw ? ` - Tooth ${toothIdRaw}` : ""}`,
            procedureName,
            procedureCode,
            toothId: toothIdRaw ? String(toothIdRaw) : undefined,
            description: normalizeText(doctorNameById.get(String(item?.created_by_doctor_id || "").trim()) || "") || patientDoctorName
              ? `${normalizeText(doctorNameById.get(String(item?.created_by_doctor_id || "").trim()) || "") || patientDoctorName} • Doctor treatment plan`
              : "Doctor treatment plan",
            date: timelineAt.split("T")[0],
            time: new Date(timelineAt).toTimeString().slice(0, 5),
            status: normalizeStatus(item?.status || "PLANNED"),
            source: "encounter_treatment",
            timelineAt,
          });
        });
      } catch (encounterError) {
        console.error("[ADMIN EVENTS] encounter merge failed", encounterError);
      }
    }

    const overdue = [];
    const todayEvents = [];
    const upcoming = [];

    allEvents.forEach((evt) => {
      const eventTs = Number(evt.timestamp || 0);
      if (!Number.isFinite(eventTs) || eventTs <= 0) return;

      const status = normalizeStatus(evt.status);
      const isDone = status === "COMPLETED" || status === "DONE";
      const isCancelled = status === "CANCELLED";
      if (isDone || isCancelled) return;

      if (eventTs < todayStart) {
        overdue.push(evt);
      } else if (eventTs <= todayEndTs) {
        todayEvents.push(evt);
      } else {
        upcoming.push(evt);
      }
    });

    overdue.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    todayEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    upcoming.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    return res.json({
      ok: true,
      overdue,
      today: todayEvents,
      upcoming,
      total: allEvents.length,
      overdueCount: overdue.length,
      todayCount: todayEvents.length,
      upcomingCount: upcoming.length,
    });
  } catch (error) {
    console.error("[ADMIN EVENTS] error:", error);
    return res.status(500).json({ ok: false, error: error?.message || "internal_error" });
  }
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
        status,
        created_at,
        primary_doctor_id
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
      status: p.status,
      created_at: p.created_at,
      primary_doctor_id: p.primary_doctor_id || null
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

/* ================= TREATMENT PAGE COMPAT ENDPOINTS ================= */
const PROCEDURE_TYPES_COMPAT = [
  { type: "CONSULT", label: "Muayene", category: "EVENTS" },
  { type: "FOLLOWUP", label: "Kontrol", category: "EVENTS" },
  { type: "FILLING", label: "Dolgu", category: "RESTORATIVE" },
  { type: "TEMP_FILLING", label: "Geçici Dolgu", category: "RESTORATIVE" },
  { type: "ROOT_CANAL_TREATMENT", label: "Kanal Tedavisi", category: "ENDODONTIC" },
  { type: "EXTRACTION", label: "Çekim", category: "SURGICAL" },
  { type: "SURGICAL_EXTRACTION", label: "Cerrahi Çekim", category: "SURGICAL" },
  { type: "CROWN", label: "Kron", category: "PROSTHETIC" },
  { type: "BRIDGE_UNIT", label: "Köprü", category: "PROSTHETIC" },
  { type: "IMPLANT", label: "İmplant", category: "IMPLANT" },
];

function normalizeTreatmentEventList(rawEvents) {
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents
    .map((eventItem) => ({
      id: String(eventItem?.id || "").trim() || `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: String(eventItem?.date || "").trim(),
      time: String(eventItem?.time || "").trim(),
      type: String(eventItem?.type || "TREATMENT").trim().toUpperCase(),
      title: String(eventItem?.title || "").trim(),
      desc: String(eventItem?.desc || "").trim(),
    }))
    .filter((eventItem) => eventItem.date && eventItem.title);
}

async function resolvePatientForAdminTreatmentPage(patientIdOrUuid, clinicId) {
  const key = String(patientIdOrUuid || "").trim();
  if (!key) return { ok: false, error: "patient_id_required" };

  const byUuid = await supabase
    .from("patients")
    .select("id, patient_id, clinic_id")
    .eq("id", key)
    .limit(1)
    .maybeSingle();

  if (!byUuid.error && byUuid.data) {
    if (clinicId && byUuid.data.clinic_id && String(byUuid.data.clinic_id) !== String(clinicId)) {
      return { ok: false, error: "access_denied" };
    }
    return { ok: true, patient: byUuid.data };
  }

  const byExternal = await supabase
    .from("patients")
    .select("id, patient_id, clinic_id")
    .eq("patient_id", key)
    .limit(1)
    .maybeSingle();

  if (!byExternal.error && byExternal.data) {
    if (clinicId && byExternal.data.clinic_id && String(byExternal.data.clinic_id) !== String(clinicId)) {
      return { ok: false, error: "access_denied" };
    }
    return { ok: true, patient: byExternal.data };
  }

  return { ok: false, error: "patient_not_found" };
}

app.get("/api/procedures", (req, res) => {
  return res.json({
    ok: true,
    types: PROCEDURE_TYPES_COMPAT,
    statuses: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
    categories: ["EVENTS", "PROSTHETIC", "RESTORATIVE", "ENDODONTIC", "SURGICAL", "IMPLANT"],
    extractionTypes: ["EXTRACTION", "SURGICAL_EXTRACTION"],
  });
});

app.get("/api/admin/treatment-prices", adminAuth, async (req, res) => {
  try {
    let query = supabase
      .from("treatment_prices")
      .select("id, treatment_code, name, price, default_price, currency, is_active, duration_minutes, break_minutes");

    const clinicId = req.admin?.clinicId || null;
    if (clinicId) query = query.eq("clinic_id", clinicId);

    const { data, error } = await query;
    if (error) {
      const code = String(error?.code || "");
      if (["42P01", "PGRST204", "42703"].includes(code)) {
        return res.json({ ok: true, prices: [] });
      }
      return res.status(500).json({ ok: false, error: "treatment_prices_fetch_failed", details: error.message });
    }

    const prices = (data || []).map((row) => ({
      id: row.id,
      treatment_name: row.treatment_code || row.name || "",
      default_price:
        row.price !== undefined && row.price !== null
          ? Number(row.price)
          : row.default_price !== undefined && row.default_price !== null
            ? Number(row.default_price)
            : 0,
      currency: row.currency || "EUR",
      is_active: row.is_active !== false,
      duration_minutes: Number.parseInt(row.duration_minutes, 10) || 0,
      break_minutes: Number.parseInt(row.break_minutes, 10) || 0,
    }));

    return res.json({ ok: true, prices });
  } catch (error) {
    console.error("[TREATMENT PRICES COMPAT] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.get("/api/patient/:patientId/treatment-events", adminAuth, async (req, res) => {
  try {
    const patientKey = String(req.params.patientId || "").trim();
    if (!patientKey) return res.status(400).json({ ok: false, error: "patient_id_required" });

    const clinicId = req.admin?.clinicId || null;
    const patientLookup = await resolvePatientForAdminTreatmentPage(patientKey, clinicId);
    if (!patientLookup.ok) {
      return res.status(patientLookup.error === "access_denied" ? 403 : 404).json({ ok: false, error: patientLookup.error });
    }

    const patientUuid = patientLookup.patient.id;
    const { data, error } = await supabase
      .from("patient_treatments")
      .select("treatment_events, treatments_data")
      .eq("patient_id", patientUuid)
      .maybeSingle();

    if (error) {
      const code = String(error?.code || "");
      if (["42P01", "PGRST204", "42703"].includes(code)) {
        return res.json({ ok: true, events: [] });
      }
      return res.status(500).json({ ok: false, error: "treatment_events_fetch_failed", details: error.message });
    }

    const fromColumn = Array.isArray(data?.treatment_events) ? data.treatment_events : null;
    const fromJson = Array.isArray(data?.treatments_data?.events) ? data.treatments_data.events : [];
    return res.json({ ok: true, events: normalizeTreatmentEventList(fromColumn || fromJson) });
  } catch (error) {
    console.error("[TREATMENT EVENTS GET] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.put("/api/patient/:patientId/treatment-events", adminAuth, async (req, res) => {
  try {
    const patientKey = String(req.params.patientId || "").trim();
    if (!patientKey) return res.status(400).json({ ok: false, error: "patient_id_required" });

    const clinicId = req.admin?.clinicId || null;
    const patientLookup = await resolvePatientForAdminTreatmentPage(patientKey, clinicId);
    if (!patientLookup.ok) {
      return res.status(patientLookup.error === "access_denied" ? 403 : 404).json({ ok: false, error: patientLookup.error });
    }

    const patientUuid = patientLookup.patient.id;
    const events = normalizeTreatmentEventList(Array.isArray(req.body?.events) ? req.body.events : []);

    const existing = await supabase
      .from("patient_treatments")
      .select("patient_id, treatments_data")
      .eq("patient_id", patientUuid)
      .maybeSingle();

    const currentData = existing?.data?.treatments_data && typeof existing.data.treatments_data === "object"
      ? existing.data.treatments_data
      : { teeth: [] };

    const nextTreatmentsData = {
      ...currentData,
      events,
    };

    const savePayload = {
      patient_id: patientUuid,
      treatments_data: nextTreatmentsData,
      treatment_events: events,
    };

    let saveResult = await supabase
      .from("patient_treatments")
      .upsert(savePayload, { onConflict: "patient_id" })
      .select("patient_id")
      .maybeSingle();

    if (saveResult.error && String(saveResult.error?.code || "") === "42703") {
      const fallbackPayload = {
        patient_id: patientUuid,
        treatments_data: nextTreatmentsData,
      };
      saveResult = await supabase
        .from("patient_treatments")
        .upsert(fallbackPayload, { onConflict: "patient_id" })
        .select("patient_id")
        .maybeSingle();
    }

    if (saveResult.error) {
      return res.status(500).json({ ok: false, error: "treatment_events_save_failed", details: saveResult.error.message });
    }

    return res.json({ ok: true, saved: true, events });
  } catch (error) {
    console.error("[TREATMENT EVENTS PUT] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
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
        status: "ACTIVE", // AUTO-APPROVE: All users are now ACTIVE
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
          status: "ACTIVE", // AUTO-APPROVE: All users are now ACTIVE
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
        status: newPatient.status || "ACTIVE", // AUTO-APPROVE: Default to ACTIVE
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Response'ta name field'ını düzgün döndür - patientName endpoint başında tanımlı
    const finalName = String(patientName || insertedPatient.name || "").trim();
    console.log(`[REGISTER] Response name: "${finalName}" (from patientName: "${patientName}", insertedPatient.name: "${insertedPatient.name}")`);

    res.json({
      ok: true,
      token: patientToken, // Frontend token bekliyor
      patientId: newPatient.name,
      referralCode: newPatient.referral_code || null,
      requestId: newPatient.name, // Backward compatibility
      name: finalName, // Name from request (patientName)
      phone: String(newPatient.phone || phone || "").trim(),
      status: newPatient.status || "ACTIVE", // AUTO-APPROVE: Default to ACTIVE
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

    // Hasta durumunu ACTIVE yap
    const { data: updatedPatient, error: updateError } = await supabase
      .from("patients")
      .update({ status: "ACTIVE" })
      .eq("id", patient.id)
      .select()
      .single();

    if (updateError) {
      console.error("[ADMIN APPROVE] Update error:", updateError);
      console.error("[ADMIN APPROVE] Update error details:", {
        message: updateError.message,
        code: updateError.code,
        details: updateError.details,
        patientId: trimmedPatientId,
        clinicId: clinicId
      });
      return res.status(500).json({ 
        ok: false, 
        error: "approval_failed",
        message: updateError.message || "Failed to approve patient",
        details: updateError.details
      });
    }

    console.log("[ADMIN APPROVE] Patient approved successfully:", updatedPatient.name);

    res.json({
      ok: true,
      patientId: updatedPatient.patient_id,
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
        patientId: patient.patient_id, // ✅ Use patient_id instead of name
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
  console.log("=== VERIFY DOCTOR DEBUG ===");
  console.log("Authorization header:", req.headers.authorization);
  console.log("JWT_SECRET used for verify:", JWT_SECRET);

  const authHeader = req.headers.authorization;
  console.log("[VERIFY DOCTOR] Raw Authorization header:", authHeader);

  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  console.log("[VERIFY DOCTOR] Extracted token:", token ? "EXISTS" : "MISSING");
  console.log("[VERIFY DOCTOR] Token length:", token?.length || 0);

  if (!token) {
    console.log("[VERIFY DOCTOR] Missing token");
    return { ok: false, code: "missing_token" };
  }

  try {
    console.log("[VERIFY DOCTOR] Using JWT_SECRET:", JWT_SECRET ? "EXISTS" : "MISSING");
    console.log("[VERIFY DOCTOR] JWT_SECRET length:", JWT_SECRET?.length || 0);

    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("[VERIFY DOCTOR] Decoded payload:", decoded);
    
    // Check if user has DOCTOR role
    if (decoded.role !== "DOCTOR") {
      console.log("[VERIFY DOCTOR] Role mismatch:", decoded.role);
      return { ok: false, code: "insufficient_permissions" };
    }

    return { 
      ok: true, 
      decoded: {
        doctorId: decoded.doctorId,
        patientId: decoded.doctorId, // For compatibility with existing code
        clinicId: decoded.clinicId,
        clinicCode: decoded.clinicCode,
        role: decoded.role,
        doctorName: decoded.doctorName,
        email: decoded.email,
        phone: decoded.phone,
        department: decoded.department,
        title: decoded.title,
        experience_years: decoded.experience_years,
        languages: decoded.languages,
        specialties: decoded.specialties,
        license_number: decoded.license_number
      }
    };
  } catch (err) {
    console.error("[VERIFY DOCTOR] JWT verification error:", err);
    console.error("[VERIFY DOCTOR] Error name:", err.name);
    console.error("[VERIFY DOCTOR] Error message:", err.message);
    return { ok: false, code: "invalid_token" };
  }
}

async function doctorCanAccessEncounter(doctorId, encounterId) {
  const encounterSelectCandidates = [
    "id, patient_id, status, doctor_id, created_by_doctor_id, assigned_doctor_id",
    "id, patient_id, status, created_by_doctor_id, assigned_doctor_id",
    "id, patient_id, status, created_by_doctor_id",
    "id, patient_id, status",
  ];

  let encounterLookup = { data: null, error: null };
  for (const selectClause of encounterSelectCandidates) {
    const attempt = await supabase
      .from("patient_encounters")
      .select(selectClause)
      .eq("id", encounterId)
      .limit(1)
      .maybeSingle();

    if (!attempt.error || !["42703", "PGRST204"].includes(String(attempt.error?.code || ""))) {
      encounterLookup = attempt;
      break;
    }
  }

  if (encounterLookup.error || !encounterLookup.data) {
    return { ok: false, error: "encounter_not_found" };
  }

  const encounter = encounterLookup.data;
  const directOwnerIds = [
    encounter.doctor_id,
    encounter.created_by_doctor_id,
    encounter.assigned_doctor_id,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  if (directOwnerIds.includes(String(doctorId))) {
    return { ok: true, encounter };
  }

  if (encounter.patient_id) {
    const patientLookup = await supabase
      .from("patients")
      .select("id, primary_doctor_id")
      .eq("id", encounter.patient_id)
      .limit(1)
      .maybeSingle();

    if (!patientLookup.error && patientLookup.data) {
      const primaryDoctorId = String(patientLookup.data.primary_doctor_id || "").trim();
      if (primaryDoctorId && primaryDoctorId === String(doctorId)) {
        return { ok: true, encounter };
      }
    }
  }

  return { ok: false, error: "not_assigned_doctor", encounter };
}

/* ================= DEBUG TOKEN ENDPOINT ================= */
app.post("/debug/token", (req, res) => {
  try {
    const { token } = req.body;
    console.log("DEBUG TOKEN VERIFY – Using JWT_SECRET:", JWT_SECRET);
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ ok: true, decoded });
  } catch (err) {
    console.log("DEBUG TOKEN ERROR:", err.message);
    res.json({ ok: false, error: err.message });
  }
});

function getUserFromToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, message: "Missing token" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const role = String(decoded?.role || "").toUpperCase();

    if (!role) {
      return res.status(401).json({ ok: false, message: "Invalid token" });
    }

    const userId = decoded.adminId || decoded.doctorId || decoded.patientId || decoded.userId;
    req.user = {
      id: userId,
      role,
      clinicId: decoded.clinicId || null,
      clinicCode: decoded.clinicCode || null,
      raw: decoded,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, message: "Invalid token" });
  }
}

function requireDoctor(req, res, next) {
  if (!req.user || req.user.role !== "DOCTOR") {
    return res.status(403).json({ ok: false, message: "Doctor only" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ ok: false, message: "Admin only" });
  }
  next();
}

function requirePatient(req, res, next) {
  if (!req.user || req.user.role !== "PATIENT") {
    return res.status(403).json({ ok: false, message: "Patient only" });
  }
  next();
}

function normalizeChatStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isDoneLikeStatus(value) {
  const normalized = normalizeChatStatus(value);
  return ["DONE", "COMPLETED", "COMPLETE", "FINISHED"].includes(normalized);
}

function toIsoOrNull(value) {
  if (!value) return null;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function resolveAppointmentReferenceDate(appointmentRow) {
  return (
    toIsoOrNull(appointmentRow?.completed_at) ||
    toIsoOrNull(appointmentRow?.done_at) ||
    toIsoOrNull(appointmentRow?.updated_at) ||
    toIsoOrNull(appointmentRow?.date) ||
    toIsoOrNull(appointmentRow?.scheduled_date) ||
    toIsoOrNull(appointmentRow?.start_time)
  );
}

async function getPatientByExternalId(patientExternalId, clinicId) {
  const normalized = String(patientExternalId || "").trim();
  if (!normalized) return { ok: false, error: "patient_id_required" };

  const query = supabase
    .from("patients")
    .select("id, patient_id, clinic_id, primary_doctor_id, assigned_doctor_id")
    .eq("patient_id", normalized);

  if (clinicId) query.eq("clinic_id", clinicId);

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return { ok: false, error: "patient_not_found" };
  }
  return { ok: true, patient: data };
}

async function getPatientByUuid(patientUuid) {
  const normalized = String(patientUuid || "").trim();
  if (!normalized) return { ok: false, error: "patient_id_required" };

  const { data, error } = await supabase
    .from("patients")
    .select("id, patient_id, clinic_id, primary_doctor_id, assigned_doctor_id")
    .eq("id", normalized)
    .maybeSingle();

  if (error || !data) return { ok: false, error: "patient_not_found" };
  return { ok: true, patient: data };
}

async function findOpenableContext({ patientUuid, doctorId, clinicId }) {
  let activeEncounter = null;
  let confirmedAppointment = null;

  const encounterResult = await supabase
    .from("patient_encounters")
    .select("id, patient_id, clinic_id, status, doctor_id, created_by_doctor_id, assigned_doctor_id, created_at")
    .eq("patient_id", patientUuid)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!encounterResult.error) {
    activeEncounter = (encounterResult.data || []).find((encounter) => {
      if (clinicId && encounter?.clinic_id && String(encounter.clinic_id) !== String(clinicId)) return false;
      if (normalizeChatStatus(encounter?.status) !== "ACTIVE") return false;

      if (!doctorId) return true;
      const ownerDoctorIds = [
        encounter?.doctor_id,
        encounter?.created_by_doctor_id,
        encounter?.assigned_doctor_id,
      ]
        .map((id) => String(id || "").trim())
        .filter(Boolean);

      return ownerDoctorIds.length === 0 || ownerDoctorIds.includes(String(doctorId));
    }) || null;
  }

  const appointmentResult = await supabase
    .from("appointments")
    .select("id, patient_id, clinic_id, doctor_id, status, date, time, start_time, scheduled_date, completed_at, done_at, updated_at")
    .eq("patient_id", patientUuid)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!appointmentResult.error) {
    confirmedAppointment = (appointmentResult.data || []).find((appointment) => {
      if (clinicId && appointment?.clinic_id && String(appointment.clinic_id) !== String(clinicId)) return false;
      if (doctorId && appointment?.doctor_id && String(appointment.doctor_id) !== String(doctorId)) return false;
      return normalizeChatStatus(appointment?.status) === "CONFIRMED";
    }) || null;
  }

  return {
    activeEncounter,
    confirmedAppointment,
    eligible: !!(activeEncounter || confirmedAppointment),
  };
}

async function loadThreadWithMessages(threadId) {
  const normalizedThreadId = String(threadId || "").trim();
  if (!normalizedThreadId) return { ok: false, error: "thread_id_required" };

  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .select("id, patient_id, doctor_id, encounter_id, appointment_id, status, opened_by, opened_at, closed_at, created_at, updated_at, clinic_id")
    .eq("id", normalizedThreadId)
    .maybeSingle();

  if (threadError || !thread) {
    return { ok: false, error: "thread_not_found" };
  }

  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("id, thread_id, sender_role, sender_id, message, is_read, created_at")
    .eq("thread_id", normalizedThreadId)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return { ok: false, error: "messages_fetch_failed", thread };
  }

  return { ok: true, thread, messages: messages || [] };
}

/* ================= ADMIN CONTROLLED CHAT ================= */
app.post("/api/admin/chat/open", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const patientExternalId = String(body.patientId || "").trim();
    const doctorId = String(body.doctorId || "").trim();

    if (!patientExternalId || !doctorId) {
      return res.status(400).json({ ok: false, error: "patientId_and_doctorId_required" });
    }

    const patientLookup = await getPatientByExternalId(patientExternalId, req.user?.clinicId || null);
    if (!patientLookup.ok) {
      return res.status(404).json({ ok: false, error: patientLookup.error || "patient_not_found" });
    }

    const patient = patientLookup.patient;
    const context = await findOpenableContext({
      patientUuid: patient.id,
      doctorId,
      clinicId: req.user?.clinicId || patient?.clinic_id || null,
    });

    if (!context.eligible) {
      return res.status(400).json({
        ok: false,
        error: "chat_open_not_allowed",
        message: "Chat can be opened only with ACTIVE encounter or CONFIRMED appointment",
      });
    }

    const encounterId = String(body.encounterId || context.activeEncounter?.id || "").trim() || null;
    const appointmentId = String(body.appointmentId || context.confirmedAppointment?.id || "").trim() || null;

    const existingThreadLookup = await supabase
      .from("chat_threads")
      .select("id, status")
      .eq("patient_id", patient.id)
      .eq("doctor_id", doctorId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let thread = null;
    if (!existingThreadLookup.error && existingThreadLookup.data) {
      const updateResult = await supabase
        .from("chat_threads")
        .update({
          status: "OPEN",
          opened_by: "ADMIN",
          opened_at: new Date().toISOString(),
          closed_at: null,
          encounter_id: encounterId,
          appointment_id: appointmentId,
          clinic_id: req.user?.clinicId || patient?.clinic_id || null,
        })
        .eq("id", existingThreadLookup.data.id)
        .select("id, patient_id, doctor_id, encounter_id, appointment_id, status, opened_by, opened_at, closed_at, created_at, updated_at, clinic_id")
        .single();

      if (updateResult.error) {
        return res.status(500).json({ ok: false, error: "thread_update_failed", details: updateResult.error.message });
      }
      thread = updateResult.data;
    } else {
      const insertResult = await supabase
        .from("chat_threads")
        .insert({
          patient_id: patient.id,
          doctor_id: doctorId,
          encounter_id: encounterId,
          appointment_id: appointmentId,
          status: "OPEN",
          opened_by: "ADMIN",
          opened_at: new Date().toISOString(),
          clinic_id: req.user?.clinicId || patient?.clinic_id || null,
        })
        .select("id, patient_id, doctor_id, encounter_id, appointment_id, status, opened_by, opened_at, closed_at, created_at, updated_at, clinic_id")
        .single();

      if (insertResult.error) {
        return res.status(500).json({ ok: false, error: "thread_create_failed", details: insertResult.error.message });
      }
      thread = insertResult.data;
    }

    return res.json({ ok: true, thread });
  } catch (error) {
    console.error("[ADMIN CHAT OPEN] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/admin/chat/close", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const threadId = String(body.threadId || "").trim();

    if (!threadId) {
      return res.status(400).json({ ok: false, error: "thread_id_required" });
    }

    const existingThreadLookup = await supabase
      .from("chat_threads")
      .select("id, clinic_id")
      .eq("id", threadId)
      .maybeSingle();

    if (existingThreadLookup.error || !existingThreadLookup.data) {
      return res.status(404).json({ ok: false, error: "thread_not_found" });
    }

    if (req.user?.clinicId && existingThreadLookup.data?.clinic_id && String(existingThreadLookup.data.clinic_id) !== String(req.user.clinicId)) {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    const updateResult = await supabase
      .from("chat_threads")
      .update({
        status: "CLOSED",
        closed_at: new Date().toISOString(),
      })
      .eq("id", threadId)
      .select("id, patient_id, doctor_id, encounter_id, appointment_id, status, opened_by, opened_at, closed_at, created_at, updated_at, clinic_id")
      .single();

    if (updateResult.error || !updateResult.data) {
      return res.status(404).json({ ok: false, error: "thread_not_found" });
    }

    return res.json({ ok: true, thread: updateResult.data });
  } catch (error) {
    console.error("[ADMIN CHAT CLOSE] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.get("/api/admin/chat/threads", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    let query = supabase
      .from("chat_threads")
      .select("id, patient_id, doctor_id, encounter_id, appointment_id, status, opened_by, opened_at, closed_at, created_at, updated_at, clinic_id")
      .order("updated_at", { ascending: false })
      .limit(300);

    if (req.user?.clinicId) {
      query = query.eq("clinic_id", req.user.clinicId);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ ok: false, error: "threads_fetch_failed", details: error.message });
    }

    return res.json({ ok: true, threads: data || [] });
  } catch (error) {
    console.error("[ADMIN CHAT THREADS] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.get("/api/admin/chat/:threadId", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    const threadId = String(req.params.threadId || "").trim();
    const result = await loadThreadWithMessages(threadId);
    if (!result.ok) {
      return res.status(404).json({ ok: false, error: result.error || "thread_not_found" });
    }

    if (req.user?.clinicId && result.thread?.clinic_id && String(result.thread.clinic_id) !== String(req.user.clinicId)) {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    return res.json({ ok: true, thread: result.thread, messages: result.messages });
  } catch (error) {
    console.error("[ADMIN CHAT THREAD DETAIL] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR CHAT ================= */
app.get("/api/doctor/chat/:patientId", getUserFromToken, requireDoctor, async (req, res) => {
  try {
    const patientExternalId = String(req.params.patientId || "").trim();
    if (!patientExternalId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const patientLookup = await getPatientByExternalId(patientExternalId, req.user?.clinicId || null);
    if (!patientLookup.ok) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const { data: thread, error: threadError } = await supabase
      .from("chat_threads")
      .select("id, patient_id, doctor_id, encounter_id, appointment_id, status, opened_by, opened_at, closed_at, created_at, updated_at, clinic_id")
      .eq("patient_id", patientLookup.patient.id)
      .eq("doctor_id", req.user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadError || !thread || normalizeChatStatus(thread.status) !== "OPEN") {
      return res.status(403).json({ ok: false, error: "chat_closed" });
    }

    const threadData = await loadThreadWithMessages(thread.id);
    if (!threadData.ok) {
      return res.status(500).json({ ok: false, error: threadData.error || "thread_fetch_failed" });
    }

    return res.json({ ok: true, thread: threadData.thread, messages: threadData.messages });
  } catch (error) {
    console.error("[DOCTOR CHAT GET] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/doctor/chat/:threadId/message", getUserFromToken, requireDoctor, async (req, res) => {
  try {
    const threadId = String(req.params.threadId || "").trim();
    const body = req.body || {};
    const message = String(body.message || "").trim();
    const encounterId = String(body.encounterId || "").trim() || null;

    if (!threadId || !message) {
      return res.status(400).json({ ok: false, error: "thread_id_and_message_required" });
    }

    const threadResult = await loadThreadWithMessages(threadId);
    if (!threadResult.ok) {
      return res.status(404).json({ ok: false, error: "thread_not_found" });
    }

    const thread = threadResult.thread;
    if (normalizeChatStatus(thread.status) !== "OPEN") {
      return res.status(403).json({ ok: false, error: "chat_closed" });
    }

    if (String(thread.doctor_id || "") !== String(req.user.id || "")) {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    if (encounterId && thread.encounter_id && String(encounterId) !== String(thread.encounter_id)) {
      return res.status(403).json({ ok: false, error: "encounter_mismatch" });
    }

    if (thread.encounter_id) {
      const encounterAccess = await doctorCanAccessEncounter(req.user.id, thread.encounter_id);
      if (!encounterAccess.ok) {
        return res.status(403).json({ ok: false, error: "encounter_access_denied" });
      }
    }

    const insertResult = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_role: "DOCTOR",
        sender_id: String(req.user.id || ""),
        message,
        is_read: false,
      })
      .select("id, thread_id, sender_role, sender_id, message, is_read, created_at")
      .single();

    if (insertResult.error) {
      return res.status(500).json({ ok: false, error: "message_send_failed", details: insertResult.error.message });
    }

    return res.json({ ok: true, message: insertResult.data });
  } catch (error) {
    console.error("[DOCTOR CHAT SEND] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= PATIENT CHAT ================= */
app.get("/api/patient/chat", getUserFromToken, requirePatient, async (req, res) => {
  try {
    const patientExternalId = String(req.user?.raw?.patientId || req.user?.id || "").trim();
    if (!patientExternalId) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const patientLookup = await getPatientByExternalId(patientExternalId, req.user?.clinicId || null);
    if (!patientLookup.ok) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const { data: thread, error: threadError } = await supabase
      .from("chat_threads")
      .select("id, patient_id, doctor_id, encounter_id, appointment_id, status, opened_by, opened_at, closed_at, created_at, updated_at, clinic_id")
      .eq("patient_id", patientLookup.patient.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadError || !thread || normalizeChatStatus(thread.status) !== "OPEN") {
      return res.status(403).json({ ok: false, error: "chat_closed" });
    }

    const threadData = await loadThreadWithMessages(thread.id);
    if (!threadData.ok) {
      return res.status(500).json({ ok: false, error: threadData.error || "thread_fetch_failed" });
    }

    return res.json({ ok: true, thread: threadData.thread, messages: threadData.messages });
  } catch (error) {
    console.error("[PATIENT CHAT GET] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/patient/chat/message", getUserFromToken, requirePatient, async (req, res) => {
  try {
    const body = req.body || {};
    const threadId = String(body.threadId || "").trim();
    const message = String(body.message || "").trim();

    if (!threadId || !message) {
      return res.status(400).json({ ok: false, error: "thread_id_and_message_required" });
    }

    const threadResult = await loadThreadWithMessages(threadId);
    if (!threadResult.ok) {
      return res.status(404).json({ ok: false, error: "thread_not_found" });
    }

    const thread = threadResult.thread;
    if (normalizeChatStatus(thread.status) !== "OPEN") {
      return res.status(403).json({ ok: false, error: "chat_closed" });
    }

    const patientExternalId = String(req.user?.raw?.patientId || req.user?.id || "").trim();
    const patientLookup = await getPatientByExternalId(patientExternalId, req.user?.clinicId || null);
    if (!patientLookup.ok || String(patientLookup.patient.id || "") !== String(thread.patient_id || "")) {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    const insertResult = await supabase
      .from("chat_messages")
      .insert({
        thread_id: threadId,
        sender_role: "PATIENT",
        sender_id: String(patientLookup.patient.patient_id || patientLookup.patient.id || ""),
        message,
        is_read: false,
      })
      .select("id, thread_id, sender_role, sender_id, message, is_read, created_at")
      .single();

    if (insertResult.error) {
      return res.status(500).json({ ok: false, error: "message_send_failed", details: insertResult.error.message });
    }

    return res.json({ ok: true, message: insertResult.data });
  } catch (error) {
    console.error("[PATIENT CHAT SEND] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= CHAT READ RECEIPT ================= */
app.post("/api/chat/:threadId/mark-read", getUserFromToken, async (req, res) => {
  try {
    const threadId = String(req.params.threadId || "").trim();
    if (!threadId) {
      return res.status(400).json({ ok: false, error: "thread_id_required" });
    }

    const threadResult = await loadThreadWithMessages(threadId);
    if (!threadResult.ok) {
      return res.status(404).json({ ok: false, error: "thread_not_found" });
    }

    const thread = threadResult.thread;
    const role = String(req.user?.role || "").toUpperCase();

    if (role === "DOCTOR") {
      if (String(thread.doctor_id || "") !== String(req.user.id || "")) {
        return res.status(403).json({ ok: false, error: "access_denied" });
      }
    } else if (role === "PATIENT") {
      const patientExternalId = String(req.user?.raw?.patientId || req.user?.id || "").trim();
      const patientLookup = await getPatientByExternalId(patientExternalId, req.user?.clinicId || null);
      if (!patientLookup.ok || String(patientLookup.patient.id || "") !== String(thread.patient_id || "")) {
        return res.status(403).json({ ok: false, error: "access_denied" });
      }
    } else if (role === "ADMIN") {
      if (req.user?.clinicId && thread?.clinic_id && String(req.user.clinicId) !== String(thread.clinic_id)) {
        return res.status(403).json({ ok: false, error: "access_denied" });
      }
    } else {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    const senderRole = role;
    const updateResult = await supabase
      .from("chat_messages")
      .update({ is_read: true })
      .eq("thread_id", threadId)
      .neq("sender_role", senderRole)
      .eq("is_read", false)
      .select("id");

    if (updateResult.error) {
      return res.status(500).json({ ok: false, error: "mark_read_failed", details: updateResult.error.message });
    }

    return res.json({ ok: true, updated: (updateResult.data || []).length });
  } catch (error) {
    console.error("[CHAT MARK READ] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= CHAT AUTO CLOSE WORKER ================= */
async function autoCloseExpiredChatThreads() {
  try {
    const nowMs = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const { data: openThreads, error: openThreadsError } = await supabase
      .from("chat_threads")
      .select("id, appointment_id, status")
      .eq("status", "OPEN")
      .not("appointment_id", "is", null)
      .limit(500);

    if (openThreadsError) {
      console.error("[CHAT AUTO CLOSE] Thread fetch error:", openThreadsError);
      return;
    }

    for (const thread of openThreads || []) {
      const appointmentId = String(thread?.appointment_id || "").trim();
      if (!appointmentId) continue;

      const { data: appointment, error: appointmentError } = await supabase
        .from("appointments")
        .select("id, status, completed_at, done_at, updated_at, date, scheduled_date, start_time")
        .eq("id", appointmentId)
        .maybeSingle();

      if (appointmentError || !appointment) continue;

      if (!isDoneLikeStatus(appointment.status)) continue;

      const referenceIso = resolveAppointmentReferenceDate(appointment);
      if (!referenceIso) continue;

      const elapsed = nowMs - Date.parse(referenceIso);
      if (!Number.isFinite(elapsed) || elapsed < sevenDaysMs) continue;

      const closeResult = await supabase
        .from("chat_threads")
        .update({
          status: "AUTO_CLOSED",
          closed_at: new Date().toISOString(),
        })
        .eq("id", thread.id)
        .eq("status", "OPEN");

      if (closeResult.error) {
        console.error("[CHAT AUTO CLOSE] Failed to close thread:", thread.id, closeResult.error);
      }
    }
  } catch (error) {
    console.error("[CHAT AUTO CLOSE] Exception:", error);
  }
}

setTimeout(() => {
  autoCloseExpiredChatThreads().catch((error) => {
    console.error("[CHAT AUTO CLOSE] Initial run failed:", error);
  });
}, 20000);

setInterval(() => {
  autoCloseExpiredChatThreads().catch((error) => {
    console.error("[CHAT AUTO CLOSE] Scheduled run failed:", error);
  });
}, 24 * 60 * 60 * 1000);

app.get("/api/procedures", (req, res) => {
  return res.json({
    ok: true,
    types: PROCEDURE_TYPES_COMPAT,
    statuses: ["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"],
    categories: ["EVENTS", "PROSTHETIC", "RESTORATIVE", "ENDODONTIC", "SURGICAL", "IMPLANT"],
    extractionTypes: ["EXTRACTION", "SURGICAL_EXTRACTION"],
  });
});

app.get("/api/admin/treatment-prices", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    let query = supabase
      .from("treatment_prices")
      .select("id, treatment_code, name, price, default_price, currency, is_active, duration_minutes, break_minutes");

    if (req.user?.clinicId) query = query.eq("clinic_id", req.user.clinicId);

    const { data, error } = await query;
    if (error) {
      const code = String(error?.code || "");
      if (["42P01", "PGRST204", "42703"].includes(code)) {
        return res.json({ ok: true, prices: [] });
      }
      return res.status(500).json({ ok: false, error: "treatment_prices_fetch_failed", details: error.message });
    }

    const prices = (data || []).map((row) => ({
      id: row.id,
      treatment_name: row.treatment_code || row.name || "",
      default_price:
        row.price !== undefined && row.price !== null
          ? Number(row.price)
          : row.default_price !== undefined && row.default_price !== null
            ? Number(row.default_price)
            : 0,
      currency: row.currency || "EUR",
      is_active: row.is_active !== false,
      duration_minutes: Number.parseInt(row.duration_minutes, 10) || 0,
      break_minutes: Number.parseInt(row.break_minutes, 10) || 0,
    }));

    return res.json({ ok: true, prices });
  } catch (error) {
    console.error("[TREATMENT PRICES COMPAT] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.get("/api/patient/:patientId/treatment-events", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    const patientKey = String(req.params.patientId || "").trim();
    if (!patientKey) return res.status(400).json({ ok: false, error: "patient_id_required" });

    const patientLookup = await resolvePatientForAdminTreatmentPage(patientKey, req.user?.clinicId || null);
    if (!patientLookup.ok) {
      return res.status(patientLookup.error === "access_denied" ? 403 : 404).json({ ok: false, error: patientLookup.error });
    }

    const patientUuid = patientLookup.patient.id;
    const { data, error } = await supabase
      .from("patient_treatments")
      .select("treatment_events, treatments_data")
      .eq("patient_id", patientUuid)
      .maybeSingle();

    if (error) {
      const code = String(error?.code || "");
      if (["42P01", "PGRST204", "42703"].includes(code)) {
        return res.json({ ok: true, events: [] });
      }
      return res.status(500).json({ ok: false, error: "treatment_events_fetch_failed", details: error.message });
    }

    const fromColumn = Array.isArray(data?.treatment_events) ? data.treatment_events : null;
    const fromJson = Array.isArray(data?.treatments_data?.events) ? data.treatments_data.events : [];
    return res.json({ ok: true, events: normalizeTreatmentEventList(fromColumn || fromJson) });
  } catch (error) {
    console.error("[TREATMENT EVENTS GET] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.put("/api/patient/:patientId/treatment-events", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    const patientKey = String(req.params.patientId || "").trim();
    if (!patientKey) return res.status(400).json({ ok: false, error: "patient_id_required" });

    const patientLookup = await resolvePatientForAdminTreatmentPage(patientKey, req.user?.clinicId || null);
    if (!patientLookup.ok) {
      return res.status(patientLookup.error === "access_denied" ? 403 : 404).json({ ok: false, error: patientLookup.error });
    }

    const patientUuid = patientLookup.patient.id;
    const events = normalizeTreatmentEventList(Array.isArray(req.body?.events) ? req.body.events : []);

    const existing = await supabase
      .from("patient_treatments")
      .select("patient_id, treatments_data")
      .eq("patient_id", patientUuid)
      .maybeSingle();

    const currentData = existing?.data?.treatments_data && typeof existing.data.treatments_data === "object"
      ? existing.data.treatments_data
      : { teeth: [] };

    const nextTreatmentsData = {
      ...currentData,
      events,
    };

    const savePayload = {
      patient_id: patientUuid,
      treatments_data: nextTreatmentsData,
      treatment_events: events,
    };

    let saveResult = await supabase
      .from("patient_treatments")
      .upsert(savePayload, { onConflict: "patient_id" })
      .select("patient_id")
      .maybeSingle();

    if (saveResult.error && String(saveResult.error?.code || "") === "42703") {
      const fallbackPayload = {
        patient_id: patientUuid,
        treatments_data: nextTreatmentsData,
      };
      saveResult = await supabase
        .from("patient_treatments")
        .upsert(fallbackPayload, { onConflict: "patient_id" })
        .select("patient_id")
        .maybeSingle();
    }

    if (saveResult.error) {
      return res.status(500).json({ ok: false, error: "treatment_events_save_failed", details: saveResult.error.message });
    }

    return res.json({ ok: true, saved: true, events });
  } catch (error) {
    console.error("[TREATMENT EVENTS PUT] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

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
    const doctorKeys = await resolveEncounterDoctorOwnerCandidates(v.decoded);

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
      if (["PGRST205", "42P01"].includes(String(error?.code || ""))) {
        return res.json({ ok: true, appointments: [] });
      }
      console.error("[DOCTOR DASHBOARD APPOINTMENTS] Error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const allowedAppointmentIds = new Set();
    const doctorKeySet = new Set(doctorKeys.map((v) => String(v || "").trim()).filter(Boolean));

    for (const apt of appointments || []) {
      const ownerId = String(apt?.doctor_id || "").trim();
      if (ownerId && doctorKeySet.has(ownerId)) {
        allowedAppointmentIds.add(String(apt.id));
      }
    }

    const assignmentSources = [
      { table: "appointment_doctors", appointmentColumn: "appointment_id", doctorColumn: "doctor_id" },
      { table: "appointment_doctors", appointmentColumn: "appointmentId", doctorColumn: "doctorId" },
    ];

    for (const source of assignmentSources) {
      let sourceUnavailable = false;
      for (const ownerDoctorId of doctorKeys) {
        const rows = await supabase
          .from(source.table)
          .select(source.appointmentColumn)
          .eq(source.doctorColumn, ownerDoctorId)
          .limit(500);

        if (!rows.error && Array.isArray(rows.data)) {
          for (const row of rows.data) {
            allowedAppointmentIds.add(String(row?.[source.appointmentColumn] || "").trim());
          }
          continue;
        }

        const code = String(rows.error?.code || "");
        if (["PGRST205", "PGRST204", "42P01", "42703"].includes(code)) {
          sourceUnavailable = true;
          break;
        }
      }
      if (!sourceUnavailable && allowedAppointmentIds.size > 0) break;
    }

    const filteredAppointments = (appointments || []).filter((apt) => allowedAppointmentIds.has(String(apt?.id || "").trim()));

    const formattedAppointments = filteredAppointments.map(apt => ({
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

/* ================= AGGREGATED DOCTOR DASHBOARD ================= */
app.get("/api/doctors/:id/dashboard", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const tokenDoctorId = String(v.decoded?.doctorId || "").trim();
    const requestedDoctorId = String(req.params?.id || "").trim();

    if (!requestedDoctorId) {
      return res.status(400).json({ ok: false, error: "doctor_id_required" });
    }

    if (tokenDoctorId && requestedDoctorId !== tokenDoctorId) {
      return res.status(403).json({ ok: false, error: "doctor_mismatch" });
    }

    const { clinicId, clinicCode } = v.decoded;
    const today = new Date().toISOString().split("T")[0];

    // Keep existing appointment logic: clinic scope + today + status != cancelled
    const appointmentSelectCandidates = [
      "id, patient_id, doctor_id, date, time, procedure, status, clinic_id, chair, chair_no",
      "id, patient_id, doctor_id, date, time, procedure, status, clinic_id, chair",
      "id, patient_id, doctor_id, date, time, procedure, status, clinic_id, chair_no",
      "id, patient_id, doctor_id, date, time, procedure, status, clinic_id",
    ];

    let appointments = [];
    let appointmentsError = null;

    for (const selectClause of appointmentSelectCandidates) {
      let appointmentsQuery = supabase
        .from("appointments")
        .select(selectClause)
        .eq("date", today)
        .neq("status", "cancelled")
        .order("time", { ascending: true });

      if (clinicId) {
        appointmentsQuery = appointmentsQuery.eq("clinic_id", clinicId);
      } else if (clinicCode) {
        appointmentsQuery = appointmentsQuery.eq("clinic_code", clinicCode);
      }

      const attempt = await appointmentsQuery;
      if (!attempt.error) {
        appointments = Array.isArray(attempt.data) ? attempt.data : [];
        appointmentsError = null;
        break;
      }

      appointmentsError = attempt.error;
      if (!["42703", "PGRST204", "PGRST205"].includes(String(attempt.error?.code || ""))) {
        break;
      }
    }

    if (appointmentsError) {
      console.error("[DOCTOR DASHBOARD AGGREGATED] appointments error:", appointmentsError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const rows = Array.isArray(appointments) ? appointments : [];
    const patientIds = Array.from(new Set(rows.map((item) => String(item?.patient_id || "").trim()).filter(Boolean)));

    let patientMap = new Map();
    if (patientIds.length > 0) {
      const patientSelectCandidates = [
        "id, patient_id, name, full_name, first_name, last_name",
        "id, patient_id, name, full_name",
        "id, patient_id, name",
      ];

      for (const selectClause of patientSelectCandidates) {
        let query = supabase.from("patients").select(selectClause).in("id", patientIds);
        if (clinicId) {
          query = query.eq("clinic_id", clinicId);
        } else if (clinicCode) {
          query = query.eq("clinic_code", clinicCode);
        }

        const { data, error } = await query;
        if (!error) {
          const patients = Array.isArray(data) ? data : [];
          patientMap = new Map(patients.map((patient) => [String(patient.id), patient]));
          break;
        }

        const code = String(error?.code || "");
        if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
          console.warn("[DOCTOR DASHBOARD AGGREGATED] patients lookup error:", error);
          break;
        }
      }
    }

    const riskMap = new Map();
    if (patientIds.length > 0) {
      let riskQuery = supabase
        .from("patient_health_forms")
        .select("patient_id, risk_flags")
        .in("patient_id", patientIds);

      if (clinicCode) {
        riskQuery = riskQuery.eq("clinic_code", clinicCode);
      }

      const { data: riskRows, error: riskError } = await riskQuery;
      if (!riskError) {
        for (const row of Array.isArray(riskRows) ? riskRows : []) {
          const patientId = String(row?.patient_id || "").trim();
          if (!patientId) continue;
          const flags = Array.isArray(row?.risk_flags) ? row.risk_flags : [];
          const critical = flags.filter((flag) => String(flag?.type || "").toLowerCase() === "critical").length;
          riskMap.set(patientId, {
            total: flags.length,
            critical,
            hasRisk: flags.length > 0,
          });
        }
      } else {
        console.warn("[DOCTOR DASHBOARD AGGREGATED] risk lookup error:", riskError);
      }
    }

    const schedule = rows.map((appointment) => {
      const patientId = String(appointment?.patient_id || "").trim();
      const patient = patientMap.get(patientId) || {};
      const risk = riskMap.get(patientId) || { total: 0, critical: 0, hasRisk: false };

      const mergedName = [patient.first_name, patient.last_name].map((item) => String(item || "").trim()).filter(Boolean).join(" ");
      const patientName =
        String(patient.name || "").trim() ||
        String(patient.full_name || "").trim() ||
        mergedName ||
        "Unknown Patient";

      return {
        id: appointment.id,
        patientId,
        patientName,
        time: appointment.time || null,
        chair: String(
          appointment?.chair_no ||
          appointment?.chair ||
          appointment?.chairNo ||
          appointment?.chair_id ||
          ""
        ).trim() || null,
        procedure: appointment.procedure || "Genel Kontrol",
        status: appointment.status || null,
        risk,
      };
    });

    const inProgressCount = schedule.reduce((count, item) => {
      const status = String(item?.status || "").trim().toUpperCase();
      return ["IN_PROGRESS", "ACTIVE", "ONGOING"].includes(status) ? count + 1 : count;
    }, 0);

    const riskCount = schedule.reduce((count, item) => (item?.risk?.hasRisk ? count + 1 : count), 0);

    return res.json({
      ok: true,
      data: {
        doctorId: requestedDoctorId,
        date: today,
        preJoin: {
          schedule,
        },
        summary: {
          totalAppointments: schedule.length,
          riskCount,
          inProgressCount,
        },
      },
    });
  } catch (error) {
    console.error("[DOCTOR DASHBOARD AGGREGATED] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR PATIENTS ================= */
app.get("/api/doctor/patients", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) return res.status(401).json({ ok: false, error: "missing_token" });

    const access = await collectDoctorEncounterAccess(v.decoded);
    const encounterPatientIds = [...new Set(
      access.encounters.map((enc) => String(enc?.patient_id || "").trim()).filter(Boolean)
    )];

    if (encounterPatientIds.length === 0) {
      return res.json({ ok: true, patients: [] });
    }

    const patientSelectAttempts = [
      "id,patient_id,name,full_name,first_name,last_name,phone,email,status,department,created_at",
      "id,patient_id,name,full_name,phone,email,status,department,created_at",
      "id,patient_id,name,phone,email,status,created_at",
    ];

    let patients = [];
    let patientsError = null;

    for (const selectClause of patientSelectAttempts) {
      const byId = await supabase
        .from("patients")
        .select(selectClause)
        .in("id", encounterPatientIds)
        .order("created_at", { ascending: false });

      const byPatientId = await supabase
        .from("patients")
        .select(selectClause)
        .in("patient_id", encounterPatientIds)
        .order("created_at", { ascending: false });

      if (!byId.error && !byPatientId.error) {
        const merged = [...(byId.data || []), ...(byPatientId.data || [])];
        const unique = new Map();
        for (const patient of merged) {
          const key = String(patient?.id || patient?.patient_id || "").trim();
          if (!key) continue;
          unique.set(key, patient);
        }
        patients = Array.from(unique.values());
        patientsError = null;
        break;
      }

      patientsError = byId.error || byPatientId.error;
      const code = String(patientsError?.code || "");
      if (!["42703", "PGRST204"].includes(code)) {
        break;
      }
    }

    if (patientsError && patients.length === 0) {
      console.error("[DOCTOR PATIENTS] strict fetch error:", patientsError);
      return res.status(500).json({ ok: false, error: "patient_fetch_failed" });
    }

    const sanitizePatientName = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";

      const normalized = text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-zçğıöşü0-9 ]/gi, "")
        .trim();

      if (!normalized) return "";
      if (["unknown", "unknown patient", "unknown unknown", "null", "undefined", "n/a", "na", "-", "--"].includes(normalized)) {
        return "";
      }

      return text;
    };

    const allowedIdSet = new Set(encounterPatientIds);
    const formatted = patients
      .filter((patient) => {
        const id = String(patient?.id || "").trim();
        const pid = String(patient?.patient_id || "").trim();
        return allowedIdSet.has(id) || allowedIdSet.has(pid);
      })
      .map((patient) => {
        const mergedName = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
        const displayName =
          sanitizePatientName(patient.name) ||
          sanitizePatientName(patient.full_name) ||
          sanitizePatientName(mergedName) ||
          "Unknown Patient";

        return {
          id: patient.id || patient.patient_id,
          patientId: patient.patient_id || patient.id,
          name: displayName,
          phone: patient.phone || "",
          email: patient.email || "",
          status: patient.status || "ACTIVE",
          department: patient.department || null,
          createdAt: patient.created_at ? new Date(patient.created_at).getTime() : null,
        };
      });

    return res.json({ ok: true, patients: formatted });

  } catch (err) {
    console.error("[DOCTOR PATIENTS] Exception:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.get("/api/doctor/doctors", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      const status = v.code === "missing_token" || v.code === "invalid_token" ? 401 : 403;
      return res.status(status).json({ ok: false, error: v.code || "unauthorized" });
    }

    const decoded = v.decoded || {};
    const doctorOwnerCandidates = await resolveEncounterDoctorOwnerCandidates(decoded);
    const doctorLookupKeys = [...new Set([
      String(decoded?.doctorId || "").trim(),
      ...doctorOwnerCandidates,
    ].filter(Boolean))];

    let resolvedClinicId = String(decoded?.clinicId || decoded?.clinic_id || "").trim();

    if (!resolvedClinicId && doctorLookupKeys.length > 0) {
      const selectCandidates = [
        "id, doctor_id, clinic_id, email",
        "id, doctor_id, clinic_id",
      ];

      for (const selectClause of selectCandidates) {
        let found = null;
        for (const key of doctorLookupKeys) {
          const byDoctorId = await supabase
            .from("doctors")
            .select(selectClause)
            .eq("doctor_id", key)
            .limit(1)
            .maybeSingle();

          if (!byDoctorId.error && byDoctorId.data?.clinic_id) {
            found = byDoctorId.data;
            break;
          }

          const byId = await supabase
            .from("doctors")
            .select(selectClause)
            .eq("id", key)
            .limit(1)
            .maybeSingle();

          if (!byId.error && byId.data?.clinic_id) {
            found = byId.data;
            break;
          }
        }

        if (found?.clinic_id) {
          resolvedClinicId = String(found.clinic_id).trim();
          break;
        }
      }
    }

    if (!resolvedClinicId) {
      return res.json({ ok: true, doctors: [] });
    }

    const selectCandidates = [
      "id, doctor_id, clinic_id, name, full_name, first_name, last_name, email, status, role",
      "id, doctor_id, clinic_id, name, full_name, email, status, role",
      "id, doctor_id, clinic_id, name, email, status, role",
    ];

    let doctors = [];
    let doctorsError = null;

    for (const selectClause of selectCandidates) {
      const result = await supabase
        .from("doctors")
        .select(selectClause)
        .eq("clinic_id", resolvedClinicId)
        .order("created_at", { ascending: false });

      if (!result.error && Array.isArray(result.data)) {
        doctors = result.data;
        doctorsError = null;
        break;
      }

      doctorsError = result.error;
      const code = String(result.error?.code || "");
      if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
        break;
      }
    }

    if (doctorsError) {
      console.error("[DOCTOR DOCTORS] fetch error:", doctorsError);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_doctors" });
    }

    const sanitizeName = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const normalized = text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-zçğıöşü0-9 ]/gi, "")
        .trim();
      if (!normalized) return "";
      if (["unknown", "unknown patient", "unknown unknown", "null", "undefined", "n/a", "na", "-", "--"].includes(normalized)) {
        return "";
      }
      return text;
    };

    const currentDoctorSet = new Set(doctorLookupKeys);

    const formatted = (doctors || [])
      .filter((doctor) => {
        const role = String(doctor?.role || "DOCTOR").trim().toUpperCase();
        if (role && role !== "DOCTOR") return false;

        const status = String(doctor?.status || "").trim().toUpperCase();
        const doctorId = String(doctor?.id || doctor?.doctor_id || "").trim();
        if (currentDoctorSet.has(doctorId)) return true;

        if (!status) return true;
        return ["APPROVED", "ACTIVE"].includes(status);
      })
      .map((doctor) => {
        const merged = `${String(doctor?.first_name || "").trim()} ${String(doctor?.last_name || "").trim()}`.trim();
        const name =
          sanitizeName(doctor?.name) ||
          sanitizeName(doctor?.full_name) ||
          sanitizeName(merged) ||
          String(doctor?.email || "Doctor").trim() ||
          "Doctor";

        return {
          id: String(doctor?.id || doctor?.doctor_id || "").trim(),
          doctor_id: String(doctor?.doctor_id || doctor?.id || "").trim(),
          name,
          email: String(doctor?.email || "").trim(),
          status: String(doctor?.status || "").trim() || null,
          role: String(doctor?.role || "DOCTOR").trim() || "DOCTOR",
        };
      })
      .filter((doctor) => !!doctor.id);

    return res.json({ ok: true, doctors: formatted, clinicId: resolvedClinicId });
  } catch (error) {
    console.error("[DOCTOR DOCTORS] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/doctor/treatment-plan/:id/add-doctor", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      const status = v.code === "missing_token" || v.code === "invalid_token" ? 401 : 403;
      return res.status(status).json({ ok: false, error: v.code || "unauthorized" });
    }

    const planId = String(req.params.id || "").trim();
    const doctorId = String(req.body?.doctorId || req.body?.doctor_id || "").trim();
    const roleRaw = String(req.body?.role || "ASSISTANT").trim().toUpperCase();

    if (!planId || !doctorId) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    if (!["PRIMARY", "ASSISTANT", "CONSULTANT", "CONSULT"].includes(roleRaw)) {
      return res.status(400).json({ ok: false, error: "invalid_role" });
    }

    const normalizedRole = roleRaw === "CONSULT" ? "CONSULTANT" : roleRaw;

    const { data: plan, error: planError } = await supabase
      .from("treatment_plans")
      .select("id, encounter_id, assigned_doctor_id")
      .eq("id", planId)
      .maybeSingle();

    if (planError && !["22P02", "PGRST116"].includes(String(planError?.code || ""))) {
      console.error("[DOCTOR PLAN ADD] plan lookup error:", planError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    if (!plan) {
      return res.status(404).json({ ok: false, error: "plan_not_found" });
    }

    const hasAccess = await doctorHasAccessToEncounter(plan.encounter_id, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const actorClinicId = String(v.decoded?.clinicId || "").trim();
    if (actorClinicId) {
      const { data: targetDoctor, error: targetDoctorError } = await supabase
        .from("doctors")
        .select("id, doctor_id, clinic_id, status, role")
        .or(`id.eq.${doctorId},doctor_id.eq.${doctorId}`)
        .limit(1)
        .maybeSingle();

      if (targetDoctorError && !["22P02", "PGRST116", "42703", "PGRST204", "PGRST205"].includes(String(targetDoctorError?.code || ""))) {
        console.warn("[DOCTOR PLAN ADD] target doctor lookup warning:", targetDoctorError);
      }

      if (targetDoctor?.clinic_id && String(targetDoctor.clinic_id).trim() !== actorClinicId) {
        return res.status(403).json({ ok: false, error: "different_clinic" });
      }
    }

    const nowIso = new Date().toISOString();
    const encounterId = String(plan.encounter_id || "").trim();

    const assignmentCandidates = [
      {
        table: "treatment_plan_doctors",
        payload: {
          treatment_plan_id: planId,
          doctor_id: doctorId,
          role: normalizedRole,
          assigned_at: nowIso,
        },
      },
      {
        table: "treatment_doctors",
        payload: {
          encounter_id: encounterId,
          doctor_id: doctorId,
          role: normalizedRole,
          assigned_at: nowIso,
        },
      },
      {
        table: "treatment_doctors",
        payload: {
          encounterId: encounterId,
          doctorId,
          role: normalizedRole,
          assignedAt: nowIso,
        },
      },
      {
        table: "encounter_doctors",
        payload: {
          encounter_id: encounterId,
          doctor_id: doctorId,
          role: normalizedRole,
          assigned_at: nowIso,
        },
      },
      {
        table: "encounter_doctors",
        payload: {
          encounterId: encounterId,
          doctorId,
          role: normalizedRole,
          assignedAt: nowIso,
        },
      },
    ];

    let assigned = false;
    let lastError = null;

    for (const candidate of assignmentCandidates) {
      if (!encounterId && String(candidate.table) !== "treatment_plan_doctors") {
        continue;
      }

      const result = await supabase.from(candidate.table).insert(candidate.payload);
      if (!result.error) {
        assigned = true;
        lastError = null;
        break;
      }

      const code = String(result.error?.code || "");
      if (code === "23505") {
        assigned = true;
        lastError = null;
        break;
      }

      if (["42P01", "42703", "PGRST204", "PGRST205", "23502"].includes(code)) {
        lastError = result.error;
        continue;
      }

      lastError = result.error;
      break;
    }

    if (!assigned && normalizedRole === "PRIMARY") {
      const promote = await supabase
        .from("treatment_plans")
        .update({ assigned_doctor_id: doctorId })
        .eq("id", planId)
        .select("id")
        .maybeSingle();

      if (!promote.error) {
        assigned = true;
      } else {
        lastError = promote.error;
      }
    }

    if (!assigned) {
      const missingAssignmentSchema = ["PGRST205", "PGRST204", "42P01", "42703"].includes(
        String(lastError?.code || "")
      );

      if (missingAssignmentSchema) {
        return res.json({
          ok: true,
          planId,
          doctorId,
          role: normalizedRole,
          storage_source: "ui_only_fallback",
          warning: "assignment_storage_unavailable",
        });
      }
    }

    if (!assigned) {
      console.error("[DOCTOR PLAN ADD] assign failed:", lastError);
      return res.status(500).json({ ok: false, error: "assign_failed" });
    }

    return res.json({ ok: true, planId, doctorId, role: normalizedRole });
  } catch (error) {
    console.error("[DOCTOR PLAN ADD] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR TREATMENT PLANS ================= */
const CROWN_CATEGORY = "CROWN";
const ALLOWED_CROWN_TYPES = new Set(["ZIRCONIA", "EMAX", "PFM", "METAL", "TEMPORARY"]);
const CROWN_DEFAULT_PRICE_BY_CODE = Object.freeze({
  CROWN_ZIRCONIA: 5500,
  CROWN_EMAX: 6000,
  CROWN_PFM: 4500,
  CROWN_METAL: 3500,
  CROWN_TEMPORARY: 1500,
});

function normalizeProcedureCode(rawValue) {
  return String(rawValue || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function normalizeProcedurePayload(raw = {}) {
  const category = normalizeProcedureCode(raw.category || "") || null;
  const type = normalizeProcedureCode(raw.type || "") || null;
  const procedureCode = normalizeProcedureCode(raw.procedure_code || raw.procedureCode || "");
  const procedureIdInput = normalizeProcedureCode(raw.procedure_id || raw.procedureId || "");

  if (category === CROWN_CATEGORY) {
    if (!type || !ALLOWED_CROWN_TYPES.has(type)) {
      return { ok: false, error: "invalid_crown_type" };
    }

    const crownProcedureId = `CROWN_${type}`;
    return {
      ok: true,
      category,
      type,
      procedureCode: procedureCode || crownProcedureId,
      procedureId: procedureIdInput || crownProcedureId,
    };
  }

  const finalCode = procedureCode || procedureIdInput;
  return {
    ok: true,
    category,
    type,
    procedureCode: finalCode,
    procedureId: procedureIdInput || finalCode,
  };
}

async function resolveClinicProcedurePrice(clinicId, procedureCode) {
  const normalizedCode = normalizeProcedureCode(procedureCode);
  if (!normalizedCode) {
    return null;
  }

  if (!clinicId) {
    const fallbackNoClinic = CROWN_DEFAULT_PRICE_BY_CODE[normalizedCode];
    if (Number.isFinite(fallbackNoClinic)) {
      console.warn("[PRICE RESOLVE] Missing clinicId, using crown fallback:", {
        procedureCode: normalizedCode,
        fallbackPrice: fallbackNoClinic,
      });
      return fallbackNoClinic;
    }
    return null;
  }

  const selectCandidates = [
    { codeColumn: "treatment_code", amountColumn: "price", includeIsActive: true },
    { codeColumn: "treatment_code", amountColumn: "default_price", includeIsActive: true },
    { codeColumn: "type", amountColumn: "price", includeIsActive: true },
    { codeColumn: "type", amountColumn: "default_price", includeIsActive: true },
    { codeColumn: "treatment_code", amountColumn: "price", includeIsActive: false },
    { codeColumn: "treatment_code", amountColumn: "default_price", includeIsActive: false },
    { codeColumn: "type", amountColumn: "price", includeIsActive: false },
    { codeColumn: "type", amountColumn: "default_price", includeIsActive: false },
  ];

  for (const candidate of selectCandidates) {
    const selectClause = candidate.includeIsActive
      ? `${candidate.amountColumn}, is_active`
      : candidate.amountColumn;

    const result = await supabase
      .from("treatment_prices")
      .select(selectClause)
      .eq("clinic_id", clinicId)
      .eq(candidate.codeColumn, normalizedCode)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      const code = String(result.error.code || "");
      if (["42703", "PGRST204"].includes(code)) {
        continue;
      }
      console.warn("[PRICE RESOLVE] Query error:", {
        clinicId,
        procedureCode: normalizedCode,
        codeColumn: candidate.codeColumn,
        amountColumn: candidate.amountColumn,
        error: result.error.message,
      });
      continue;
    }

    if (!result.data) {
      continue;
    }

    if (
      candidate.includeIsActive &&
      Object.prototype.hasOwnProperty.call(result.data, "is_active") &&
      result.data.is_active === false
    ) {
      return null;
    }

    const rawAmount = result.data[candidate.amountColumn];
    const numericPrice = Number(rawAmount);
    if (Number.isFinite(numericPrice)) {
      return numericPrice;
    }
  }

  const fallback = CROWN_DEFAULT_PRICE_BY_CODE[normalizedCode];
  if (Number.isFinite(fallback)) {
    console.warn("[PRICE RESOLVE] No clinic-specific crown price, using fallback:", {
      clinicId,
      procedureCode: normalizedCode,
      fallbackPrice: fallback,
    });
    return fallback;
  }

  return null;
}

// GET /api/doctor/treatment-plans - Get doctor's treatment plans
app.get("/api/doctor/treatment-plans", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;

    const ownerCandidates = await resolveEncounterDoctorOwnerCandidates(v.decoded);
    const doctorOwnerKeys = [...new Set([String(doctorId || "").trim(), ...ownerCandidates].filter(Boolean))];

    const mergedPlans = [];
    let hardError = null;

    const treatmentPlanSelectCandidates = [
      `
          *,
          patient_encounters!inner(
            id,
            patient_id,
            created_by_doctor_id,
            status,
            created_at
          ),
          treatment_items!left(
            id,
            tooth_fdi_code,
            procedure_code,
            procedure_name,
            procedure_description,
            status,
            is_visible_to_patient
          )
        `,
      `
          *,
          patient_encounters!inner(
            id,
            patient_id,
            created_by_doctor_id,
            status,
            created_at
          ),
          treatment_items!left(
            id,
            tooth_fdi_code,
            procedure_code,
            procedure_name,
            status,
            is_visible_to_patient
          )
        `,
      `
          *,
          patient_encounters!inner(
            id,
            patient_id,
            created_by_doctor_id,
            status,
            created_at
          ),
          treatment_items!left(
            id,
            tooth_fdi_code,
            procedure_code,
            status
          )
        `,
    ];

    for (const doctorOwnerId of doctorOwnerKeys) {
      let keySucceeded = false;

      for (const selectClause of treatmentPlanSelectCandidates) {
        const result = await supabase
          .from("treatment_plans")
          .select(selectClause)
          .eq("created_by_doctor_id", doctorOwnerId)
          .order("created_at", { ascending: false });

        if (!result.error) {
          mergedPlans.push(...(result.data || []));
          keySucceeded = true;
          break;
        }

        const code = String(result.error?.code || "");
        if (["42703", "PGRST204", "PGRST205"].includes(code)) {
          continue;
        }
        if (code === "22P02") {
          keySucceeded = true;
          break;
        }
        hardError = result.error;
        break;
      }

      if (hardError) break;
      if (!keySucceeded) continue;
    }

    if (hardError) {
      console.error("[TREATMENT PLANS] Error fetching plans:", hardError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const treatmentPlans = Array.from(
      new Map((mergedPlans || []).map((plan) => [String(plan?.id || ""), plan])).values()
    );

    const encounterPatientIds = Array.from(new Set(
      (treatmentPlans || [])
        .map((plan) => plan?.patient_encounters?.patient_id)
        .filter(Boolean)
    ));

    let patientRows = [];
    if (encounterPatientIds.length > 0) {
      const { data: byPatientId } = await supabase
        .from("patients")
        .select("id, patient_id, name, full_name, first_name, last_name, phone, email")
        .in("patient_id", encounterPatientIds);

      const { data: byId } = await supabase
        .from("patients")
        .select("id, patient_id, name, full_name, first_name, last_name, phone, email")
        .in("id", encounterPatientIds);

      patientRows = [...(byPatientId || []), ...(byId || [])];
    }

    const patientMap = new Map();
    for (const patient of patientRows) {
      if (patient?.id) patientMap.set(String(patient.id), patient);
      if (patient?.patient_id) patientMap.set(String(patient.patient_id), patient);
    }

    const formattedPlans = (treatmentPlans || []).map((plan) => {
      const rawItems = Array.isArray(plan?.treatment_items)
        ? plan.treatment_items
        : plan?.treatment_items
          ? [plan.treatment_items]
          : [];

      const items = rawItems
        .filter((item) => item && item.id)
        .map((item) => ({
          id: item.id,
          tooth_fdi_code: item.tooth_fdi_code,
          procedure_code: item.procedure_code,
          procedure_description: item.procedure_description || item.procedure_name,
          status: item.status,
          is_visible_to_patient: item.is_visible_to_patient ?? null,
        }));

      const encounterPatientId = plan?.patient_encounters?.patient_id;
      const patient = patientMap.get(String(encounterPatientId || "")) || null;
      const patientName =
        patient?.full_name ||
        [patient?.first_name, patient?.last_name].filter(Boolean).join(" ").trim() ||
        patient?.name ||
        null;

      return {
        id: plan.id,
        encounter_id: plan.encounter_id,
        status: plan.status,
        created_at: plan.created_at,
        submitted_at: plan.submitted_at,
        completed_at: plan.completed_at,
        patient: {
          id: patient?.id || null,
          patient_id: patient?.patient_id || null,
          name: patientName,
          phone: patient?.phone || null,
          email: patient?.email || null,
        },
        encounter: {
          id: plan?.patient_encounters?.id,
          status: plan?.patient_encounters?.status,
          created_at: plan?.patient_encounters?.created_at,
        },
        items,
        items_count: items.length,
      };
    });

    res.json({
      ok: true,
      treatment_plans: formattedPlans
    });

  } catch (err) {
    console.error("[TREATMENT PLANS] Get exception:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR TREATMENT PLANS ================= */

// POST /api/doctor/treatment-plans - Create new treatment plan
app.post("/api/doctor/treatment-plans", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId, clinicId, clinicCode, email } = v.decoded;
    const { encounter_id, items } = req.body || {};

    // Validation
    if (!encounter_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    // Rule 1: Token validation - Doctor role check handled by verifyDoctorToken

    // Rule 2: Encounter kontrolü
    const { data: encounter, error: encounterError } = await supabase
      .from("patient_encounters")
      .select("*")
      .eq("id", encounter_id)
      .single();

    if (encounterError || !encounter) {
      return res.status(404).json({ ok: false, error: "encounter_not_found" });
    }

    if (encounter.status !== "ACTIVE") {
      return res.status(400).json({ ok: false, error: "encounter_not_active" });
    }

    const hasEncounterAccess = await doctorHasAccessToEncounter(encounter_id, v.decoded);
    if (!hasEncounterAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    // Rule 3: Aynı encounter içinde aktif plan var mı kontrol et
    const { data: existingPlans, error: existingPlansError } = await supabase
      .from("treatment_plans")
      .select("id, status")
      .eq("encounter_id", encounter_id);

    if (existingPlansError) {
      console.error("[TREATMENT PLANS] Error checking existing plans:", existingPlansError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const activeExistingPlans = (existingPlans || []).filter((plan) => {
      const status = String(plan?.status || "").toUpperCase();
      return !["COMPLETED", "DONE", "CANCELLED", "CLOSED", "REJECTED"].includes(status);
    });

    if (activeExistingPlans.length > 0) {
      return res.status(400).json({ ok: false, error: "active_plan_already_exists" });
    }

    // Rule 4: Plan oluştur
    const { data: treatmentPlan, error: planError } = await supabase
      .from("treatment_plans")
      .insert({
        encounter_id: encounter_id,
        status: "DRAFT",
        created_by_doctor_id: doctorId,
        assigned_doctor_id: doctorId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (planError) {
      console.error("[TREATMENT PLANS] Error creating plan:", planError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    // Rule 5: Plan items ekle (crown hierarchy + clinic price injection)
    const planItems = [];
    for (const item of items) {
      const normalized = normalizeProcedurePayload(item || {});
      if (!normalized.ok) {
        return res.status(400).json({ ok: false, error: normalized.error });
      }

      const resolvedPrice = await resolveClinicProcedurePrice(clinicId, normalized.procedureCode);
      if (normalized.category === CROWN_CATEGORY && resolvedPrice === null) {
        return res.status(400).json({ ok: false, error: "crown_price_not_configured" });
      }

      planItems.push({
        treatment_plan_id: treatmentPlan.id,
        tooth_fdi_code: item.tooth_fdi_code,
        procedure_id: normalized.procedureId || null,
        procedure_code: normalized.procedureCode || null,
        procedure_description: item.procedure_description,
        category: normalized.category,
        type: normalized.type,
        price: resolvedPrice,
        estimated_duration_minutes: item.estimated_duration_minutes || 30,
        status: "PLANNED",
        is_visible_to_patient: false,
        created_by_doctor_id: doctorId,
        created_at: new Date().toISOString()
      });
    }

    let { error: itemsError } = await supabase
      .from("treatment_items")
      .insert(planItems);

    const hasNewColumnsError =
      !!itemsError &&
      (String(itemsError.code || "") === "42703" || String(itemsError.code || "") === "PGRST204");

    if (hasNewColumnsError) {
      const legacyPlanItems = planItems.map((item) => ({
        treatment_plan_id: item.treatment_plan_id,
        tooth_fdi_code: item.tooth_fdi_code,
        procedure_code: item.procedure_code,
        procedure_description: item.procedure_description,
        estimated_duration_minutes: item.estimated_duration_minutes,
        status: item.status,
        is_visible_to_patient: item.is_visible_to_patient,
        created_by_doctor_id: item.created_by_doctor_id,
        created_at: item.created_at,
      }));

      const legacyInsert = await supabase
        .from("treatment_items")
        .insert(legacyPlanItems);

      itemsError = legacyInsert.error;
    }

    if (itemsError) {
      console.error("[TREATMENT PLANS] Error creating items:", itemsError);
      // Rollback plan creation
      await supabase.from("treatment_plans").delete().eq("id", treatmentPlan.id);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({
      ok: true,
      treatment_plan: treatmentPlan,
      items_created: planItems.length
    });

  } catch (err) {
    console.error("[TREATMENT PLANS] Exception:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// PATCH /api/doctor/treatment-plans/:id/submit - Submit treatment plan
app.patch("/api/doctor/treatment-plans/:id/submit", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;
    const { id } = req.params;

    // Get treatment plan and verify ownership
    const { data: plan, error: planError } = await supabase
      .from("treatment_plans")
      .select(`
        *,
        patient_encounters!inner(
          id,
          created_by_doctor_id as doctor_id,
          patient_id,
          status
        )
      `)
      .eq("id", id)
      .eq("created_by_doctor_id", doctorId)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ ok: false, error: "plan_not_found" });
    }

    if (plan.status !== "DRAFT") {
      return res.status(400).json({ ok: false, error: "plan_not_draft" });
    }

    // Update plan status to SUBMITTED
    const { data: updatedPlan, error: updateError } = await supabase
      .from("treatment_plans")
      .update({
        status: "SUBMITTED",
        submitted_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("[TREATMENT PLANS] Error submitting plan:", updateError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({
      ok: true,
      treatment_plan: updatedPlan
    });

  } catch (err) {
    console.error("[TREATMENT PLANS] Submit exception:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// PATCH /api/doctor/treatment-plans/:id/complete - Complete treatment plan
app.patch("/api/doctor/treatment-plans/:id/complete", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;
    const { id } = req.params;

    // Get treatment plan with items and encounter
    const { data: plan, error: planError } = await supabase
      .from("treatment_plans")
      .select(`
        *,
        patient_encounters!inner(
          id,
          created_by_doctor_id as doctor_id,
          patient_id,
          status
        ),
        treatment_items!inner(
          id,
          status
        )
      `)
      .eq("id", id)
      .eq("created_by_doctor_id", doctorId)
      .single();

    if (planError || !plan) {
      return res.status(404).json({ ok: false, error: "plan_not_found" });
    }

    if (plan.status !== "SUBMITTED") {
      return res.status(400).json({ ok: false, error: "plan_not_submitted" });
    }

    // Önce kontrol: Tüm item'lar DONE değilse
    const incompleteItems = plan.treatment_items.filter(item => item.status !== "DONE");
    if (incompleteItems.length > 0) {
      return res.status(400).json({ ok: false, error: "items_not_completed" });
    }

    // Update plan status to COMPLETED
    const { data: updatedPlan, error: planUpdateError } = await supabase
      .from("treatment_plans")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (planUpdateError) {
      console.error("[TREATMENT PLANS] Error completing plan:", planUpdateError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    // Update encounter to CLOSED
    const { error: encounterUpdateError } = await supabase
      .from("patient_encounters")
      .update({
        status: "CLOSED",
        closed_at: new Date().toISOString()
      })
      .eq("id", plan.patient_encounters.id);

    if (encounterUpdateError) {
      console.error("[TREATMENT PLANS] Error closing encounter:", encounterUpdateError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    res.json({
      ok: true,
      treatment_plan: updatedPlan,
      encounter_closed: true
    });

  } catch (err) {
    console.error("[TREATMENT PLANS] Complete exception:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

async function planHasPrimaryDoctor(treatmentPlanId) {
  const { data, error } = await supabase
    .from("treatment_plan_doctors")
    .select("id")
    .eq("treatment_plan_id", treatmentPlanId)
    .eq("role", "PRIMARY")
    .limit(1);

  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

app.post("/api/doctor/treatment-plan", getUserFromToken, requireDoctor, async (req, res) => {
  try {
    const { patientId, diagnosisId } = req.body || {};
    const doctorId = req.user.id;

    if (!patientId || !diagnosisId) {
      return res.status(400).json({ ok: false, message: "patientId and diagnosisId are required" });
    }

    const { data: plan, error: planError } = await supabase
      .from("treatment_plans")
      .insert({
        patient_id: patientId,
        diagnosis_id: diagnosisId,
        created_by_doctor_id: doctorId,
        status: "DRAFT",
      })
      .select("*")
      .single();

    if (planError || !plan) {
      console.error("CREATE_PLAN_ERROR:", planError);
      return res.status(500).json({ ok: false, message: "create_plan_failed" });
    }

    const { error: assignError } = await supabase
      .from("treatment_plan_doctors")
      .insert({
        treatment_plan_id: plan.id,
        doctor_id: doctorId,
        role: "PRIMARY",
        assigned_at: new Date().toISOString(),
      });

    if (assignError) {
      console.error("CREATE_PLAN_PRIMARY_ASSIGN_ERROR:", assignError);
      await supabase.from("treatment_plans").delete().eq("id", plan.id);
      return res.status(500).json({ ok: false, message: "primary_assign_failed" });
    }

    return res.json({ ok: true, plan });
  } catch (error) {
    console.error("CREATE_PLAN_ERROR:", error);
    return res.status(500).json({ ok: false });
  }
});

app.post("/api/doctor/treatment-plan/:id/add-doctor", getUserFromToken, requireDoctor, async (req, res) => {
  try {
    const planId = req.params.id;
    const { doctorId, role } = req.body || {};

    if (!doctorId || !role) {
      return res.status(400).json({ ok: false, message: "doctorId and role are required" });
    }

    const normalizedRole = String(role).toUpperCase();
    if (!["PRIMARY", "ASSISTANT", "CONSULTANT"].includes(normalizedRole)) {
      return res.status(400).json({ ok: false, message: "invalid_role" });
    }

    const { error } = await supabase
      .from("treatment_plan_doctors")
      .insert({
        treatment_plan_id: planId,
        doctor_id: doctorId,
        role: normalizedRole,
        assigned_at: new Date().toISOString(),
      });

    if (error) {
      console.error("ADD_DOCTOR_ERROR:", error);
      return res.status(500).json({ ok: false });
    }

    const hasPrimary = await planHasPrimaryDoctor(planId);
    if (!hasPrimary) {
      return res.status(400).json({ ok: false, message: "plan_must_have_primary" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("ADD_DOCTOR_ERROR:", error);
    return res.status(500).json({ ok: false });
  }
});

app.put("/api/admin/treatment-plan/:id/change-primary", getUserFromToken, requireAdmin, async (req, res) => {
  try {
    const { newPrimaryDoctorId } = req.body || {};
    const planId = req.params.id;

    if (!newPrimaryDoctorId) {
      return res.status(400).json({ ok: false, message: "newPrimaryDoctorId is required" });
    }

    const { error: demoteError } = await supabase
      .from("treatment_plan_doctors")
      .update({ role: "ASSISTANT" })
      .eq("treatment_plan_id", planId)
      .eq("role", "PRIMARY");

    if (demoteError) {
      console.error("CHANGE_PRIMARY_DEMOTE_ERROR:", demoteError);
      return res.status(500).json({ ok: false });
    }

    const { data: existingMembership, error: existingMembershipError } = await supabase
      .from("treatment_plan_doctors")
      .select("id")
      .eq("treatment_plan_id", planId)
      .eq("doctor_id", newPrimaryDoctorId)
      .maybeSingle();

    if (existingMembershipError) {
      console.error("CHANGE_PRIMARY_LOOKUP_ERROR:", existingMembershipError);
      return res.status(500).json({ ok: false });
    }

    if (existingMembership?.id) {
      const { error: promoteError } = await supabase
        .from("treatment_plan_doctors")
        .update({ role: "PRIMARY" })
        .eq("id", existingMembership.id);

      if (promoteError) {
        console.error("CHANGE_PRIMARY_PROMOTE_ERROR:", promoteError);
        return res.status(500).json({ ok: false });
      }
    } else {
      const { error: insertError } = await supabase
        .from("treatment_plan_doctors")
        .insert({
          treatment_plan_id: planId,
          doctor_id: newPrimaryDoctorId,
          role: "PRIMARY",
          assigned_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("CHANGE_PRIMARY_INSERT_ERROR:", insertError);
        return res.status(500).json({ ok: false });
      }
    }

    const hasPrimary = await planHasPrimaryDoctor(planId);
    if (!hasPrimary) {
      return res.status(400).json({ ok: false, message: "plan_must_have_primary" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("CHANGE_PRIMARY_ERROR:", error);
    return res.status(500).json({ ok: false });
  }
});

app.post("/api/doctor/procedure", getUserFromToken, requireDoctor, async (req, res) => {
  try {
    const { treatmentPlanId, title, scheduledDate, toothId, price, currency, patientId } = req.body || {};
    const doctorId = req.user.id;
    const tokenClinicId = req.user?.clinicId || null;

    if (!treatmentPlanId || !title) {
      return res.status(400).json({ ok: false, message: "treatmentPlanId and title are required" });
    }

    const { data: assigned, error: assignedError } = await supabase
      .from("treatment_plan_doctors")
      .select("id")
      .eq("treatment_plan_id", treatmentPlanId)
      .eq("doctor_id", doctorId)
      .maybeSingle();

    if (assignedError) {
      console.error("CREATE_PROCEDURE_ASSIGN_CHECK_ERROR:", assignedError);
      return res.status(500).json({ ok: false });
    }

    if (!assigned) {
      return res.status(403).json({ ok: false, message: "Doctor not assigned to plan" });
    }

    let clinicId = tokenClinicId;
    if (!clinicId) {
      const doctorLookup = await supabase
        .from("doctors")
        .select("id, clinic_id")
        .eq("id", doctorId)
        .limit(1)
        .maybeSingle();

      if (!doctorLookup.error && doctorLookup.data?.clinic_id) {
        clinicId = doctorLookup.data.clinic_id;
      }
    }

    console.log("[CREATE_PROCEDURE] clinic debug", {
      doctorId,
      clinicId,
      treatmentPlanId,
      patientId: patientId || null,
      title,
    });

    let procedure = null;
    let procedureError = null;

    const insertPayloads = [
      {
        treatment_plan_id: treatmentPlanId,
        patient_id: patientId || null,
        doctor_id: doctorId,
        clinic_id: clinicId,
        title,
        tooth_id: toothId || null,
        price: price ?? null,
        currency: currency || "TRY",
        status: "PLANNED",
        scheduled_date: scheduledDate || null,
      },
      {
        treatment_plan_id: treatmentPlanId,
        patient_id: patientId || null,
        doctor_id: doctorId,
        title,
        tooth_id: toothId || null,
        price: price ?? null,
        currency: currency || "TRY",
        status: "PLANNED",
        scheduled_date: scheduledDate || null,
      },
    ];

    for (const payload of insertPayloads) {
      const insertResult = await supabase
        .from("procedures")
        .insert(payload)
        .select("*")
        .single();

      if (!insertResult.error && insertResult.data) {
        procedure = insertResult.data;
        procedureError = null;
        break;
      }

      procedureError = insertResult.error;
      const code = String(insertResult.error?.code || "");
      if (!["42703", "PGRST204", "23502"].includes(code)) {
        break;
      }
    }

    if (procedureError) {
      console.error("CREATE_PROCEDURE_ERROR:", procedureError);
      return res.status(500).json({ ok: false });
    }

    return res.json({ ok: true, procedure });
  } catch (error) {
    console.error("CREATE_PROCEDURE_ERROR:", error);
    return res.status(500).json({ ok: false });
  }
});

app.put("/api/treatment-plan/:id/finalize", getUserFromToken, async (req, res) => {
  try {
    const planId = req.params.id;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      return res.status(401).json({ ok: false, message: "Invalid token" });
    }

    const { data: planOwner, error: planOwnerError } = await supabase
      .from("treatment_plans")
      .select("id, created_by_doctor_id")
      .eq("id", planId)
      .limit(1)
      .maybeSingle();

    if (planOwnerError || !planOwner) {
      return res.status(404).json({ ok: false, message: "plan_not_found" });
    }

    const { data: doctorRole, error: doctorRoleError } = await supabase
      .from("treatment_plan_doctors")
      .select("role")
      .eq("treatment_plan_id", planId)
      .eq("doctor_id", userId)
      .maybeSingle();

    const roleCheckUnavailable = String(doctorRoleError?.code || "") === "PGRST205";

    if (doctorRoleError && !roleCheckUnavailable) {
      console.error("FINALIZE_PLAN_ROLE_CHECK_ERROR:", doctorRoleError);
      return res.status(500).json({ ok: false });
    }

    if (userRole !== "ADMIN") {
      if (roleCheckUnavailable) {
        if (String(planOwner.created_by_doctor_id || "") !== String(userId || "")) {
          return res.status(403).json({ ok: false, message: "Not authorized" });
        }
      } else if (!doctorRole || doctorRole.role !== "PRIMARY") {
        return res.status(403).json({ ok: false, message: "Not authorized" });
      }
    }

    if (!roleCheckUnavailable) {
      const hasPrimary = await planHasPrimaryDoctor(planId);
      if (!hasPrimary) {
        return res.status(400).json({ ok: false, message: "plan_must_have_primary" });
      }
    }

    const finalizedAt = new Date().toISOString();
    let finalizeError = null;

    const finalizePayloads = [
      {
        status: "IN_PROGRESS",
        visible_to_patient: true,
        finalized_by_doctor_id: userId,
        finalized_at: finalizedAt,
      },
      {
        status: "IN_PROGRESS",
        finalized_by_doctor_id: userId,
        finalized_at: finalizedAt,
      },
      {
        status: "IN_PROGRESS",
      },
      {
        status: "in_progress",
      },
    ];

    for (const payload of finalizePayloads) {
      const finalizeAttempt = await supabase
        .from("treatment_plans")
        .update(payload)
        .eq("id", planId);

      if (!finalizeAttempt.error) {
        finalizeError = null;
        break;
      }

      finalizeError = finalizeAttempt.error;

      if (!["42703", "PGRST204", "22P02", "23514"].includes(String(finalizeAttempt.error?.code || ""))) {
        break;
      }
    }

    if (finalizeError) {
      console.error("FINALIZE_PLAN_ERROR:", finalizeError);
      return res.status(500).json({ ok: false });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("FINALIZE_PLAN_ERROR:", error);
    return res.status(500).json({ ok: false });
  }
});

// ================= LEGACY MOBILE COMPAT: DIAGNOSIS-BASED TREATMENT ROUTES =================
app.get("/api/treatment/diagnoses/:diagnosisId/plan", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;
    const diagnosisId = String(req.params.diagnosisId || "").trim();

    if (!diagnosisId) {
      return res.status(400).json({ ok: false, error: "diagnosis_id_required" });
    }

    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("encounter_diagnoses")
      .select("id, encounter_id")
      .eq("id", diagnosisId)
      .limit(1)
      .maybeSingle();

    if (diagnosisError || !diagnosis) {
      return res.status(404).json({ ok: false, error: "diagnosis_not_found" });
    }

    const { data: plan, error } = await supabase
      .from("treatment_plans")
      .select("*")
      .eq("encounter_id", diagnosis.encounter_id)
      .eq("created_by_doctor_id", doctorId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("LEGACY_GET_PLAN_BY_DIAGNOSIS_ERROR:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    return res.json({ ok: true, exists: !!plan, treatmentPlan: plan || null });
  } catch (error) {
    console.error("LEGACY_GET_PLAN_BY_DIAGNOSIS_EXCEPTION:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/treatment/diagnoses/:diagnosisId/plan", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;
    const diagnosisId = String(req.params.diagnosisId || "").trim();

    if (!diagnosisId) {
      return res.status(400).json({ ok: false, error: "diagnosis_id_required" });
    }

    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("encounter_diagnoses")
      .select("id, encounter_id")
      .eq("id", diagnosisId)
      .limit(1)
      .maybeSingle();

    if (diagnosisError || !diagnosis) {
      return res.status(404).json({ ok: false, error: "diagnosis_not_found" });
    }

    const encounterAccess = await doctorCanAccessEncounter(doctorId, diagnosis.encounter_id);
    if (!encounterAccess.ok) {
      if (encounterAccess.error === "encounter_not_found") {
        return res.status(404).json({ ok: false, error: "encounter_not_found" });
      }
      return res.status(403).json({ ok: false, error: "not_assigned_doctor" });
    }
    const encounter = encounterAccess.encounter;

    const { data: existingPlan, error: existingError } = await supabase
      .from("treatment_plans")
      .select("*")
      .eq("encounter_id", diagnosis.encounter_id)
      .eq("created_by_doctor_id", doctorId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("LEGACY_CREATE_PLAN_EXISTING_LOOKUP_ERROR:", existingError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    if (existingPlan) {
      return res.json({ ok: true, exists: true, treatmentPlan: existingPlan });
    }

    const basePayload = {
      encounter_id: diagnosis.encounter_id,
      created_by_doctor_id: doctorId,
      assigned_doctor_id: doctorId,
      created_at: new Date().toISOString(),
    };
    const payloadBases = [
      {
        ...basePayload,
        visible_to_patient: false,
      },
      basePayload,
    ];

    const statusCandidates = [
      "draft",
      "proposed",
      "approved",
      "rejected",
      "completed",
      "active",
      "closed",
      "planned",
      "in_progress",
      "done",
      "cancelled",
      "DRAFT",
      "SUBMITTED",
      "PROPOSED",
      "APPROVED",
      "REJECTED",
      "COMPLETED",
      "IN_PROGRESS",
      "PLANNED",
      "DONE",
      "CANCELLED",
      "ACTIVE",
      "CLOSED",
    ];
    const payloadCandidates = [];

    for (const payloadBase of payloadBases) {
      for (const candidateStatus of statusCandidates) {
        payloadCandidates.push({
          ...payloadBase,
          status: candidateStatus,
          patient_id: encounter.patient_id,
          diagnosis_id: diagnosisId,
        });
        payloadCandidates.push({
          ...payloadBase,
          status: candidateStatus,
          diagnosis_id: diagnosisId,
        });
        payloadCandidates.push({
          ...payloadBase,
          status: candidateStatus,
        });
      }
    }

    for (const payloadBase of payloadBases) {
      payloadCandidates.push({
        ...payloadBase,
        patient_id: encounter.patient_id,
        diagnosis_id: diagnosisId,
      });
      payloadCandidates.push({
        ...payloadBase,
        diagnosis_id: diagnosisId,
      });
      payloadCandidates.push(payloadBase);
    }
    payloadCandidates.push({
      encounter_id: diagnosis.encounter_id,
      created_by_doctor_id: doctorId,
    });

    let plan = null;
    let createPlanError = null;

    for (const payloadCandidate of payloadCandidates) {
      const createAttempt = await supabase
        .from("treatment_plans")
        .insert(payloadCandidate)
        .select("*")
        .single();

      if (!createAttempt.error && createAttempt.data) {
        plan = createAttempt.data;
        createPlanError = null;
        break;
      }

      createPlanError = createAttempt.error;

      if (!["42703", "23514", "23503", "22P02", "PGRST204"].includes(String(createAttempt.error?.code || ""))) {
        break;
      }
    }

    if (createPlanError || !plan) {
      const { data: fallbackPlan, error: fallbackPlanError } = await supabase
        .from("treatment_plans")
        .select("*")
        .eq("encounter_id", diagnosis.encounter_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!fallbackPlanError && fallbackPlan) {
        return res.json({ ok: true, exists: true, treatmentPlan: fallbackPlan });
      }

      console.error("LEGACY_CREATE_PLAN_ERROR:", createPlanError);
      return res.json({
        ok: true,
        exists: false,
        treatmentPlan: null,
        createPlanFailed: true,
        createPlanError: createPlanError?.message || null,
      });
    }

    const { error: assignError } = await supabase
      .from("treatment_plan_doctors")
      .insert({
        treatment_plan_id: plan.id,
        doctor_id: doctorId,
        role: "PRIMARY",
        assigned_at: new Date().toISOString(),
      });

    if (assignError) {
      console.error("LEGACY_CREATE_PLAN_ASSIGN_ERROR:", assignError);
    }

    return res.json({ ok: true, exists: false, treatmentPlan: plan });
  } catch (error) {
    console.error("LEGACY_CREATE_PLAN_EXCEPTION:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/treatment/plans/:id/items", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId, clinicId } = v.decoded;
    const planId = String(req.params.id || "").trim();

    if (!planId) {
      return res.status(400).json({ ok: false, error: "plan_id_required" });
    }

    const {
      tooth_number,
      procedure_id,
      procedure_code,
      procedure_name,
      category,
      type,
      linked_icd10_code,
      status,
      chair_no,
      chairNo,
      chair,
      scheduled_at,
      scheduledAt,
      scheduled_date,
      duration_minutes,
      duration,
    } = req.body || {};
    if (!tooth_number || !procedure_code || !procedure_name) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    const parseScheduledAtIso = (value) => {
      if (!value) return null;
      if (typeof value === "number" && Number.isFinite(value)) {
        return new Date(value).toISOString();
      }
      const raw = String(value).trim();
      if (!raw) return null;
      const ts = Date.parse(raw);
      if (!Number.isFinite(ts)) return null;
      return new Date(ts).toISOString();
    };

    const scheduledAtValue =
      parseScheduledAtIso(scheduled_at) ||
      parseScheduledAtIso(scheduledAt) ||
      parseScheduledAtIso(scheduled_date) ||
      null;
    const chairValue = String(chair_no || chairNo || chair || "").trim() || null;
    const durationRaw = Number.parseInt(String(duration_minutes ?? duration ?? "10"), 10);
    const durationValue = Number.isFinite(durationRaw) ? Math.max(10, Math.min(240, durationRaw)) : 10;

    const normalized = normalizeProcedurePayload({
      procedure_id,
      procedure_code,
      category,
      type,
    });

    if (!normalized.ok) {
      return res.status(400).json({ ok: false, error: normalized.error });
    }

    const resolvedPrice = await resolveClinicProcedurePrice(clinicId, normalized.procedureCode);
    if (normalized.category === CROWN_CATEGORY && resolvedPrice === null) {
      return res.status(400).json({ ok: false, error: "crown_price_not_configured" });
    }

    const { data: plan, error: planError } = await supabase
      .from("treatment_plans")
      .select("id, created_by_doctor_id")
      .eq("id", planId)
      .limit(1)
      .maybeSingle();

    if (planError || !plan) {
      return res.status(404).json({ ok: false, error: "plan_not_found" });
    }

    if (plan.created_by_doctor_id && plan.created_by_doctor_id !== doctorId) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    if (scheduledAtValue) {
      const normalizeChair = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return "";
        const prefixed = raw.match(/^chair\s*(\d+)$/i);
        if (prefixed) return String(Number(prefixed[1]));
        if (/^\d+$/.test(raw)) return String(Number(raw));
        return raw.toUpperCase();
      };

      const dateOnly = scheduledAtValue.slice(0, 10);
      const dayStartIso = `${dateOnly}T00:00:00.000Z`;
      const dayEndDate = new Date(dayStartIso);
      dayEndDate.setUTCDate(dayEndDate.getUTCDate() + 1);
      const dayEndIso = dayEndDate.toISOString();
      const requestStartTs = Date.parse(scheduledAtValue);
      const requestEndTs = requestStartTs + durationValue * 60000;
      const targetChair = normalizeChair(chairValue);

      const fetchDayRows = async (tableName) => {
        const attempts = [];

        if (clinicId) {
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).eq("date", dateOnly));
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).eq("appointment_date", dateOnly));
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).gte("start_at", dayStartIso).lt("start_at", dayEndIso));
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).gte("startAt", dayStartIso).lt("startAt", dayEndIso));
        }

        if (v.decoded?.clinicCode) {
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", v.decoded.clinicCode).eq("date", dateOnly));
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", v.decoded.clinicCode).eq("appointment_date", dateOnly));
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", v.decoded.clinicCode).gte("start_at", dayStartIso).lt("start_at", dayEndIso));
          attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", v.decoded.clinicCode).gte("startAt", dayStartIso).lt("startAt", dayEndIso));
        }

        for (const run of attempts) {
          const result = await run();
          if (!result.error) return Array.isArray(result.data) ? result.data : [];
          const code = String(result.error?.code || "");
          const msg = String(result.error?.message || "").toLowerCase();
          const schemaIssue = ["42P01", "42703", "PGRST204", "PGRST205"].includes(code) || msg.includes("does not exist") || msg.includes("column");
          if (schemaIssue) continue;
        }

        return [];
      };

      const toIso = (value) => {
        if (!value) return null;
        const ts = Date.parse(String(value));
        if (!Number.isFinite(ts)) return null;
        return new Date(ts).toISOString();
      };

      const dateTimeToIsoSafe = (dateValue, timeValue) => {
        const d = String(dateValue || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
        const tRaw = String(timeValue || "00:00").trim();
        const t = /^\d{2}:\d{2}$/.test(tRaw) ? `${tRaw}:00` : tRaw;
        return toIso(`${d}T${t}`);
      };

      const getDurationFromRow = (row, fallback = 10) => {
        const parsed = Number.parseInt(
          String(row?.duration_minutes ?? row?.estimated_duration_minutes ?? row?.duration ?? row?.estimated_duration ?? "0"),
          10
        );
        if (Number.isFinite(parsed) && parsed > 0) return Math.max(10, Math.min(240, parsed));
        const endIso = toIso(row?.end_at) || toIso(row?.endAt) || null;
        const startIso = toIso(row?.start_at) || toIso(row?.startAt) || dateTimeToIsoSafe(row?.date || row?.appointment_date, row?.time);
        if (startIso && endIso) {
          const diff = Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
          if (Number.isFinite(diff) && diff > 0) return Math.max(10, Math.min(240, diff));
        }
        return fallback;
      };

      const overlaps = (startA, endA, startB, endB) => startA < endB && endA > startB;
      const ignoredStatuses = new Set(["CANCELLED", "CANCELED", "REJECTED"]);

      const [appointments, requests] = await Promise.all([
        fetchDayRows("appointments"),
        fetchDayRows("appointment_requests"),
      ]);
      const dayRows = [...appointments, ...requests];

      for (const row of dayRows) {
        const rowStatus = String(row?.status || "").trim().toUpperCase();
        if (ignoredStatuses.has(rowStatus)) continue;

        const rowDoctor = String(row?.doctor_id || row?.doctorId || row?.doctor || "").trim();
        if (!rowDoctor || rowDoctor !== String(doctorId || "").trim()) continue;

        const startIso =
          toIso(row?.start_at) ||
          toIso(row?.startAt) ||
          dateTimeToIsoSafe(row?.date || row?.appointment_date, row?.time);
        if (!startIso) continue;

        const rowStartTs = Date.parse(startIso);
        if (!Number.isFinite(rowStartTs)) continue;
        const rowDuration = getDurationFromRow(row, 10);
        const rowEndTs = rowStartTs + rowDuration * 60000;

        if (overlaps(requestStartTs, requestEndTs, rowStartTs, rowEndTs)) {
          return res.status(409).json({
            ok: false,
            error: "doctor_visit_conflict",
            message: "Doctor has another visit appointment at this time",
          });
        }
      }

      if (targetChair) {
        for (const row of dayRows) {
          const rowStatus = String(row?.status || "").trim().toUpperCase();
          if (ignoredStatuses.has(rowStatus)) continue;

          const rowChair = normalizeChair(row?.chair ?? row?.chair_no ?? row?.chairNo ?? row?.chair_name ?? row?.chairName ?? row?.chair_id ?? row?.chairId);
          if (!rowChair || rowChair !== targetChair) continue;

          const startIso =
            toIso(row?.start_at) ||
            toIso(row?.startAt) ||
            dateTimeToIsoSafe(row?.date || row?.appointment_date, row?.time);
          if (!startIso) continue;

          const rowStartTs = Date.parse(startIso);
          if (!Number.isFinite(rowStartTs)) continue;
          const rowDuration = getDurationFromRow(row, 10);
          const rowEndTs = rowStartTs + rowDuration * 60000;

          if (overlaps(requestStartTs, requestEndTs, rowStartTs, rowEndTs)) {
            return res.status(409).json({
              ok: false,
              error: "chair_conflict",
              message: "Chair is not available at this time",
            });
          }
        }
      }
    }

    const basePayload = {
      treatment_plan_id: planId,
      tooth_fdi_code: String(tooth_number),
      procedure_id: normalized.procedureId || null,
      procedure_code: normalized.procedureCode || String(procedure_code),
      category: normalized.category,
      type: normalized.type,
      price: resolvedPrice,
      linked_icd10_code: linked_icd10_code || null,
      status: String(status || "planned").toLowerCase(),
      created_by_doctor_id: doctorId,
      chair_no: chairValue,
      chair: chairValue,
      scheduled_at: scheduledAtValue,
    };

    const buildLegacySchedulePayloads = (payload) => {
      const base = { ...(payload || {}) };
      const attempts = [];

      if (scheduledAtValue) {
        attempts.push({ ...base, scheduled_at: scheduledAtValue });
        attempts.push({ ...base, scheduled_date: scheduledAtValue });
        attempts.push({ ...base, due_date: scheduledAtValue });
      }

      attempts.push(base);
      return attempts;
    };

    let item = null;
    let itemError = null;

    let usedLegacyColumns = false;

    const primaryInsert = await supabase
      .from("treatment_items")
      .insert({
        ...basePayload,
        procedure_description: String(procedure_name),
      })
      .select("id, treatment_plan_id, tooth_fdi_code, procedure_id, procedure_code, procedure_description, category, type, price, linked_icd10_code, status")
      .single();

    item = primaryInsert.data;
    itemError = primaryInsert.error;

    const missingProcedureDescriptionColumn =
      !!itemError &&
      (
        String(itemError.code || "") === "42703" ||
        String(itemError.code || "") === "PGRST204" ||
        /procedure_description.*(does not exist|schema cache)/i.test(String(itemError.message || ""))
      );

    const missingNewColumns =
      !!itemError &&
      (
        /procedure_id|category|type|price/i.test(String(itemError.message || "")) ||
        String(itemError.code || "") === "42703" ||
        String(itemError.code || "") === "PGRST204"
      );

    if (missingNewColumns) {
      usedLegacyColumns = true;
      const legacyBase = {
        treatment_plan_id: planId,
        tooth_fdi_code: String(tooth_number),
        procedure_code: normalized.procedureCode || String(procedure_code),
        procedure_description: String(procedure_name),
        linked_icd10_code: linked_icd10_code || null,
        status: String(status || "planned").toLowerCase(),
        created_by_doctor_id: doctorId,
        chair_no: chairValue,
        chair: chairValue,
      };

      for (const payload of buildLegacySchedulePayloads(legacyBase)) {
        const attempt = await supabase
          .from("treatment_items")
          .insert(payload)
          .select("id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_description, linked_icd10_code, status, scheduled_at, scheduled_date, due_date, created_at")
          .single();

        if (!attempt.error) {
          item = attempt.data;
          itemError = null;
          break;
        }

        itemError = attempt.error;
        const code = String(attempt.error?.code || "");
        if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
          break;
        }
      }
    }

    if (missingProcedureDescriptionColumn) {
      const legacyBase = {
        treatment_plan_id: planId,
        tooth_fdi_code: String(tooth_number),
        procedure_code: normalized.procedureCode || String(procedure_code),
        linked_icd10_code: linked_icd10_code || null,
        status: String(status || "planned").toLowerCase(),
        created_by_doctor_id: doctorId,
        procedure_name: String(procedure_name),
        chair_no: chairValue,
        chair: chairValue,
      };

      for (const payload of buildLegacySchedulePayloads(legacyBase)) {
        const attempt = await supabase
          .from("treatment_items")
          .insert(payload)
          .select("id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, linked_icd10_code, status, scheduled_at, scheduled_date, due_date, created_at")
          .single();

        if (!attempt.error) {
          item = attempt.data;
          itemError = null;
          break;
        }

        itemError = attempt.error;
        const code = String(attempt.error?.code || "");
        if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
          break;
        }
      }

      if (!itemError && item) {
        item = {
          ...item,
          procedure_description: item.procedure_name || null,
        };
      }
    }

    if (itemError || !item) {
      console.error("LEGACY_ADD_TREATMENT_ITEM_ERROR:", itemError);
      return res.status(500).json({ ok: false, error: "item_create_failed", details: itemError?.message || null });
    }

    if (item?.id && resolvedPrice !== null && usedLegacyColumns) {
      const priceInsert = await supabase
        .from("treatment_item_prices")
        .insert({
          treatment_item_id: item.id,
          price: resolvedPrice,
          currency: "TRY",
          visible_to: "admin",
        });

      if (priceInsert.error) {
        console.warn("[TREATMENT ITEMS] price fallback insert failed", priceInsert.error);
      }
    }

    if (item && resolvedPrice !== null && (item.price === undefined || item.price === null)) {
      item.price = resolvedPrice;
    }

    if (item && (item.procedure_id === undefined || item.procedure_id === null) && normalized.procedureId) {
      item.procedure_id = normalized.procedureId;
    }
    if (item && (item.category === undefined || item.category === null) && normalized.category) {
      item.category = normalized.category;
    }
    if (item && (item.type === undefined || item.type === null) && normalized.type) {
      item.type = normalized.type;
    }

    return res.json({
      id: item.id,
      treatment_plan_id: item.treatment_plan_id,
      tooth_number: item.tooth_fdi_code,
      procedure_code: item.procedure_code,
      procedure_name: item.procedure_description,
      linked_icd10_code: item.linked_icd10_code,
      scheduled_at: item.scheduled_at || item.scheduled_date || item.due_date || scheduledAtValue || null,
      created_at: item.created_at || null,
      status: String(item.status || "PLANNED").toLowerCase(),
    });
  } catch (error) {
    console.error("LEGACY_ADD_TREATMENT_ITEM_EXCEPTION:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

async function updateTreatmentItemStatusHandler(req, res) {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;
    const itemId = String(req.params.id || "").trim();
    const requestedStatus = String(req.body?.status || "").trim().toUpperCase();

    if (!itemId) {
      return res.status(400).json({ ok: false, error: "item_id_required" });
    }

    if (!requestedStatus || !["DONE", "CANCELLED", "IN_PROGRESS", "ACTIVE"].includes(requestedStatus)) {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }

    const { data: itemWithPlan, error: lookupError } = await supabase
      .from("treatment_items")
      .select(`
        id,
        treatment_plan_id,
        treatment_plans!inner(
          id,
          created_by_doctor_id
        )
      `)
      .eq("id", itemId)
      .limit(1)
      .maybeSingle();

    if (lookupError || !itemWithPlan) {
      return res.status(404).json({ ok: false, error: "item_not_found" });
    }

    const ownerDoctorId = String(itemWithPlan?.treatment_plans?.created_by_doctor_id || "");
    if (ownerDoctorId && ownerDoctorId !== doctorId) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const statusCandidates =
      requestedStatus === "DONE"
        ? ["done", "DONE", "completed", "COMPLETED"]
        : (requestedStatus === "IN_PROGRESS" || requestedStatus === "ACTIVE")
          ? ["in_progress", "active", "IN_PROGRESS", "ACTIVE"]
          : ["cancelled", "CANCELLED", "canceled", "CANCELED"];

    let updatedItem = null;
    let updateError = null;

    for (const statusCandidate of statusCandidates) {
      const attempt = await supabase
        .from("treatment_items")
        .update({ status: statusCandidate })
        .eq("id", itemId)
        .select("id, treatment_plan_id, status")
        .single();

      if (!attempt.error && attempt.data) {
        updatedItem = attempt.data;
        updateError = null;
        break;
      }

      updateError = attempt.error;
      if (!["22P02", "23514", "PGRST204"].includes(String(attempt.error?.code || ""))) {
        break;
      }
    }

    if (updateError || !updatedItem) {
      console.error("LEGACY_UPDATE_TREATMENT_ITEM_STATUS_ERROR:", updateError);
      return res.status(500).json({ ok: false, error: "status_update_failed", details: updateError?.message || null });
    }

    return res.json({
      ok: true,
      item: {
        id: updatedItem.id,
        treatment_plan_id: updatedItem.treatment_plan_id,
        status: String(updatedItem.status || requestedStatus).toUpperCase(),
      },
    });
  } catch (error) {
    console.error("LEGACY_UPDATE_TREATMENT_ITEM_STATUS_EXCEPTION:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

app.put("/api/treatment/treatment-items/:id/status", updateTreatmentItemStatusHandler);
app.put("/api/treatment-items/:id/status", updateTreatmentItemStatusHandler);

app.put("/api/treatment/treatment-items/:id", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const itemId = String(req.params.id || "").trim();
    if (!itemId) {
      return res.status(400).json({ ok: false, error: "item_id_required" });
    }

    const doctorKeys = [...new Set([
      String(v.decoded?.doctorId || "").trim(),
      String(v.decoded?.id || "").trim(),
      String(v.decoded?.doctor_id || "").trim(),
    ].filter(Boolean))];

    const {
      title,
      procedure_name,
      procedure_code,
      scheduledDate,
      scheduled_at,
      scheduled_date,
      due_date,
      price,
      doctorId,
      doctor_id,
      chairNo,
      chair_no,
      chair,
      note,
      notes,
    } = req.body || {};

    const parseIso = (value) => {
      if (!value) return null;
      const ts = Date.parse(String(value));
      return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
    };

    const normalizedTitle = String(title || procedure_name || "").trim() || null;
    const normalizedCode = String(procedure_code || "").trim() || null;
    const normalizedDoctor = String(doctorId || doctor_id || "").trim() || null;
    const normalizedChair = String(chairNo || chair_no || chair || "").trim() || null;
    const normalizedNote = String(note || notes || "").trim() || null;
    const normalizedScheduled =
      parseIso(scheduledDate) ||
      parseIso(scheduled_at) ||
      parseIso(scheduled_date) ||
      parseIso(due_date) ||
      null;

    const normalizedPrice =
      price === undefined || price === null || String(price).trim() === ""
        ? null
        : Number(price);

    const overridePatch = {};
    if (title !== undefined || procedure_name !== undefined) {
      overridePatch.title = normalizedTitle;
    }
    if (procedure_code !== undefined) {
      overridePatch.procedure_code = normalizedCode;
    }
    if (scheduledDate !== undefined || scheduled_at !== undefined || scheduled_date !== undefined || due_date !== undefined) {
      overridePatch.planned_date = normalizedScheduled;
    }
    if (price !== undefined) {
      overridePatch.price = normalizedPrice;
    }
    if (doctorId !== undefined || doctor_id !== undefined) {
      overridePatch.doctor_id = normalizedDoctor;
    }
    if (chairNo !== undefined || chair_no !== undefined || chair !== undefined) {
      overridePatch.chair_no = normalizedChair;
    }
    if (note !== undefined || notes !== undefined) {
      overridePatch.note = normalizedNote;
    }

    if (price !== undefined && price !== null && String(price).trim() !== "" && !Number.isFinite(normalizedPrice)) {
      return res.status(400).json({ ok: false, error: "invalid_price" });
    }

    const hasAnyUpdate = [
      title,
      procedure_name,
      procedure_code,
      scheduledDate,
      scheduled_at,
      scheduled_date,
      due_date,
      price,
      doctorId,
      doctor_id,
      chairNo,
      chair_no,
      chair,
      note,
      notes,
    ].some((value) => value !== undefined);

    if (!hasAnyUpdate) {
      return res.status(400).json({ ok: false, error: "no_updatable_fields" });
    }

    const verifyOwnership = async (tableName) => {
      const item = await supabase
        .from(tableName)
        .select("id, treatment_plan_id")
        .eq("id", itemId)
        .maybeSingle();

      if (item.error || !item.data) return { exists: false, ok: false };

      const planId = String(item.data.treatment_plan_id || "");
      if (!planId) return { exists: true, ok: true };

      const plan = await supabase
        .from("treatment_plans")
        .select("id, created_by_doctor_id")
        .eq("id", planId)
        .maybeSingle();

      if (plan.error || !plan.data) return { exists: true, ok: false };
      const owner = String(plan.data.created_by_doctor_id || "");
      return { exists: true, ok: doctorKeys.includes(owner) };
    };

    const applyUpdateCandidates = async (tableName, columnNames, value) => {
      if (value === undefined) return { updated: false, skipped: true };

      for (const columnName of columnNames) {
        const result = await supabase
          .from(tableName)
          .update({ [columnName]: value })
          .eq("id", itemId)
          .select("id")
          .maybeSingle();

        if (!result.error) return { updated: true };

        const code = String(result.error?.code || "");
        const msg = String(result.error?.message || "").toLowerCase();
        const schemaIssue = ["42703", "PGRST204", "PGRST205"].includes(code) || msg.includes("column") || msg.includes("does not exist");
        if (schemaIssue) continue;

        if (code === "22P02" || code === "23514") continue;
        return { updated: false, hardError: result.error };
      }

      return { updated: false };
    };

    const patchTable = async (tableName) => {
      const ownership = await verifyOwnership(tableName);
      if (!ownership.exists) return { exists: false, updated: false, forbidden: false };
      if (!ownership.ok) return { exists: true, updated: false, forbidden: true };

      const candidateUpdates = [
        { cols: ["procedure_description", "procedure_name"], value: normalizedTitle },
        { cols: ["procedure_code", "procedure_id"], value: normalizedCode },
        { cols: ["price"], value: normalizedPrice },
        { cols: ["doctor_id", "created_by_doctor_id"], value: normalizedDoctor },
        { cols: ["chair_no", "chair"], value: normalizedChair },
        { cols: ["note", "notes"], value: normalizedNote },
        { cols: ["scheduled_at", "scheduled_date", "due_date"], value: normalizedScheduled },
      ];

      let anyUpdated = false;
      for (const upd of candidateUpdates) {
        const result = await applyUpdateCandidates(tableName, upd.cols, upd.value);
        if (result.hardError) return { exists: true, updated: false, forbidden: false, hardError: result.hardError };
        if (result.updated) anyUpdated = true;
      }

      if (!anyUpdated) {
        return { exists: true, updated: false, forbidden: false, noChangesApplied: true };
      }

      const row = await supabase
        .from(tableName)
        .select("*")
        .eq("id", itemId)
        .maybeSingle();

      if (!row.error && row.data) {
        return { exists: true, updated: true, forbidden: false, item: row.data };
      }

      return { exists: true, updated: false, forbidden: false };
    };

    const primary = await patchTable("treatment_items");
    if (primary.forbidden) return res.status(403).json({ ok: false, error: "forbidden" });
    if (primary.hardError) return res.status(500).json({ ok: false, error: "item_update_failed" });
    if (primary.updated) {
      const overrideData = Object.keys(overridePatch).length ? saveTreatmentItemOverride(itemId, overridePatch) : null;
      const itemWithOverride = overrideData ? applyTreatmentItemOverride(primary.item, overrideData) : primary.item;
      return res.json({ ok: true, item: itemWithOverride });
    }

    const fallback = await patchTable("treatment_plan_items");
    if (fallback.forbidden) return res.status(403).json({ ok: false, error: "forbidden" });
    if (fallback.hardError) return res.status(500).json({ ok: false, error: "item_update_failed" });
    if (fallback.updated) {
      const overrideData = Object.keys(overridePatch).length ? saveTreatmentItemOverride(itemId, overridePatch) : null;
      const itemWithOverride = overrideData ? applyTreatmentItemOverride(fallback.item, overrideData) : fallback.item;
      return res.json({ ok: true, item: itemWithOverride });
    }

    if (primary.noChangesApplied || fallback.noChangesApplied) {
      if (Object.keys(overridePatch).length) {
        const overrideData = saveTreatmentItemOverride(itemId, overridePatch);
        return res.json({ ok: true, item: { id: itemId, ...overrideData }, persisted_via_override: true });
      }
      return res.status(422).json({ ok: false, error: "no_changes_applied" });
    }

    return res.status(404).json({ ok: false, error: "item_not_found" });
  } catch (error) {
    console.error("[TREATMENT ITEM UPDATE] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR TREATMENT ENDPOINTS ================= */

// Get patient info for doctor
app.get("/api/doctor/patient/:patientId", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, doctorId } = v.decoded;
    const { patientId } = req.params;

    // Doctor cannot access their own treatment data
    if (checkDoctorSelfAccess(doctorId, patientId)) {
      return res.status(403).json({ ok: false, error: "self_access_denied" });
    }

    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    let patient = null;
    const patientSelectClause =
      "id, patient_id, name, full_name, first_name, last_name, status, created_at, last_visit, clinic_id, primary_doctor_id, assigned_doctor_id, assigned_doctor, doctor_id";

    const byId = await supabase
      .from("patients")
      .select(patientSelectClause)
      .eq("id", patientId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    if (!byId.error && byId.data) {
      patient = byId.data;
    } else {
      const byLegacyId = await supabase
        .from("patients")
        .select(patientSelectClause)
        .eq("patient_id", patientId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (!byLegacyId.error && byLegacyId.data) {
        patient = byLegacyId.data;
      } else {
        const byIdNoClinic = await supabase
          .from("patients")
          .select(patientSelectClause)
          .eq("id", patientId)
          .maybeSingle();

        if (!byIdNoClinic.error && byIdNoClinic.data) {
          patient = byIdNoClinic.data;
        } else {
          const byLegacyNoClinic = await supabase
            .from("patients")
            .select(patientSelectClause)
            .eq("patient_id", patientId)
            .maybeSingle();

          if (!byLegacyNoClinic.error && byLegacyNoClinic.data) {
            patient = byLegacyNoClinic.data;
          }
        }
      }
    }

    if (!patient) {
      const encounterLookup = await supabase
        .from("patient_encounters")
        .select(`
          patient_id,
          patients!inner(
            id,
            name,
            full_name,
            first_name,
            last_name
          )
        `)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!encounterLookup.error && encounterLookup.data?.patients) {
        const patientFromEncounter = encounterLookup.data.patients;
        const mergedFromEncounter = [patientFromEncounter?.first_name, patientFromEncounter?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        const nameFromEncounter =
          String(patientFromEncounter?.name || "").trim() ||
          String(patientFromEncounter?.full_name || "").trim() ||
          mergedFromEncounter ||
          "Unknown Patient";

        return res.json({
          ok: true,
          patient: {
            id: patientId,
            patientId,
            name: nameFromEncounter,
            status: "Pending",
            lastVisit: null,
          },
        });
      }

      return res.json({
        ok: true,
        patient: {
          id: patientId,
          patientId,
          name: "Unknown Patient",
          status: "Pending",
          lastVisit: null,
        },
      });
    }

    const sanitizePatientName = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const normalized = text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-zçğıöşü0-9 ]/gi, "")
        .trim();
      if (!normalized) return "";
      if (["unknown", "unknown patient", "unknown unknown", "null", "undefined", "n/a", "na", "-", "--"].includes(normalized)) {
        return "";
      }
      return text;
    };

    const mergedFirstLast = [patient?.first_name, patient?.last_name].filter(Boolean).join(" ").trim();
    let patientDisplayName =
      sanitizePatientName(patient?.name) ||
      sanitizePatientName(patient?.full_name) ||
      sanitizePatientName(mergedFirstLast) ||
      "";

    if (!patientDisplayName) {
      const encounterNameLookup = await supabase
        .from("patient_encounters")
        .select(`
          patients!inner(
            name,
            full_name,
            first_name,
            last_name
          )
        `)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!encounterNameLookup.error && encounterNameLookup.data?.patients) {
        const p = encounterNameLookup.data.patients;
        const mergedEncounterName = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
        patientDisplayName =
          sanitizePatientName(p?.name) ||
          sanitizePatientName(p?.full_name) ||
          sanitizePatientName(mergedEncounterName) ||
          "";
      }
    }

    if (!patientDisplayName) {
      patientDisplayName = "Unknown Patient";
    }

    res.json({
      ok: true,
      patient: {
        id: patient.id,
        patientId: patient.patient_id || patient.id,
        name: patientDisplayName,
        status: patient.status === "ACTIVE" ? "Active" : "Pending",
        lastVisit: null,
      }
    });
  } catch (err) {
    console.error("[DOCTOR PATIENT INFO] Error:", err);
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

    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
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

    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
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

    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
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

    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
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

    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
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

    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
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
      password // Add password field for auth user creation
    } = req.body || {};

    if (!clinicCode || !phone || !name || !password) {
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

    // 2️⃣ Clinic-based duplicate check
    const { data: existingDoctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("clinic_id", clinic.id)
      .eq("email", email?.trim())
      .single();

    if (existingDoctor) {
      return res.status(400).json({
        ok: false,
        error: "doctor_already_registered_in_this_clinic"
      });
    }

    // 2️⃣ Clinic-based phone duplicate check
    const { data: existingPhoneDoctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("clinic_id", clinic.id)
      .eq("phone", phone.trim())
      .single();

    if (existingPhoneDoctor) {
      return res.status(400).json({
        ok: false,
        error: "doctor_phone_already_registered_in_this_clinic"
      });
    }

    // 🔥 CRITICAL: Create auth user first to get the UUID
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email?.trim() || `${phone}@cliniflow.app`,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: name,
        role: "DOCTOR",
        clinic_code: clinic.clinic_code,
        phone: phone.trim()
      }
    });

    if (authError) {
      console.error("[DOCTOR REGISTER] Auth user creation error:", authError);
      return res.status(500).json({
        ok: false,
        error: "auth_user_creation_failed",
        details: authError.message
      });
    }

    console.log("[DOCTOR REGISTER] Auth user created:", authUser.user.id);

    // 3️⃣ Insert into DOCTORS table using auth.user.id
    const doctorPayload = {
      id: authUser.user.id, // 🔥 CRITICAL: Use auth.user.id instead of crypto.randomUUID()
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
      // Rollback auth user creation
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(500).json({
        ok: false,
        error: "registration_failed",
        details: insertError.message
      });
    }

    console.log("[DOCTOR REGISTER] Doctor created with auth user ID:", authUser.user.id);

    res.json({
      ok: true,
      message: "Doctor registration successful. Awaiting admin approval.",
      doctorId: insertedDoctor.doctor_id,
      authUserId: authUser.user.id, // 🔥 CRITICAL: Return auth user ID for frontend
      status: insertedDoctor.status
    });

  } catch (err) {
    console.error("[DOCTOR REGISTER] Fatal error:", err);
    res.status(500).json({ ok: false, error: "registration_failed" });
  }
});
// doctor dev-login handler removed; all clients should hit /api/doctor/login instead

/* ================= DOCTOR LOGIN ================= */
app.post("/api/doctor/login", async (req, res) => {
  try {
    const body = req.body || {};
    const rawEmail = body.email ?? body.mail ?? body.userEmail;
    const rawClinicCode = body.clinicCode ?? body.clinic_code ?? body.cliniccode;

    if (!clinicCode || (!email && !phone)) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    const normalizedClinicCode = String(clinicCode).trim().toUpperCase();
    const normalizedEmail = email ? String(email).trim().toLowerCase() : "";

    let doctor = null;
    let doctorIdForToken = null;

    if (password) {
      const authEmail = normalizedEmail || `${phone}@cliniflow.app`;
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: String(password),
      });

      if (authError) {
        console.error("[DOCTOR LOGIN] Auth error:", authError);
        return res.status(401).json({
          ok: false,
          error: "invalid_credentials",
          details: authError.message,
        });
      }

      const authUserId = String(authData?.user?.id || "").trim();
      const doctorById = await supabase
        .from("doctors")
        .select("id, doctor_id, full_name, name, email, phone, department, title, experience_years, languages, specialties, license_number, clinic_id, clinic_code, status")
        .eq("id", authUserId)
        .eq("clinic_code", normalizedClinicCode)
        .in("status", ["APPROVED", "ACTIVE"])
        .maybeSingle();

      if (doctorById.error || !doctorById.data) {
        console.error("[DOCTOR LOGIN] Doctor not found by auth user id:", doctorById.error);
        return res.status(401).json({ ok: false, error: "doctor_not_found_or_not_approved" });
      }

      doctor = doctorById.data;
      doctorIdForToken = authUserId;
    } else {
      if (!normalizedEmail) {
        return res.status(400).json({ ok: false, error: "email_required" });
      }

      const doctorByEmail = await supabase
        .from("doctors")
        .select("id, doctor_id, full_name, name, email, phone, department, title, experience_years, languages, specialties, license_number, clinic_id, clinic_code, status")
        .eq("email", normalizedEmail)
        .eq("clinic_code", normalizedClinicCode)
        .in("status", ["APPROVED", "ACTIVE"])
        .maybeSingle();

      if (doctorByEmail.error || !doctorByEmail.data) {
        console.error("[DOCTOR LOGIN] Doctor not found by email:", doctorByEmail.error);
        return res.status(401).json({ ok: false, error: "doctor_not_found_or_not_approved" });
      }

      doctor = doctorByEmail.data;
      doctorIdForToken = String(doctor.doctor_id || doctor.id || "").trim();
    }

    if (!doctor || !doctorIdForToken) {
      return res.status(401).json({ ok: false, error: "doctor_not_found_or_not_approved" });
    }

    const token = jwt.sign(
      {
        doctorId: doctorIdForToken,
        clinicId: doctor.clinic_id,
        clinicCode: doctor.clinic_code,
        role: "DOCTOR",
        doctorName: doctor.full_name || doctor.name || "",
        email: doctor.email || "",
        phone: doctor.phone || "",
        department: doctor.department || "",
        title: doctor.title || "",
        experience_years: doctor.experience_years || 0,
        languages: doctor.languages || [],
        specialties: doctor.specialties || [],
        license_number: doctor.license_number || "",
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const safeName = doctor.full_name || doctor.name || "";

    console.log("[DOCTOR LOGIN] Doctor logged in:", {
      doctorId: doctorIdForToken,
      doctorName: safeName,
      clinicCode: doctor.clinic_code,
      passwordFlow: !!password,
    });

    return res.json({
      ok: true,
      token,
      user: {
        id: doctorIdForToken,
        token,
        type: "doctor",
        role: "DOCTOR",
        doctorId: doctorIdForToken,
        name: safeName,
        email: doctor.email,
        phone: doctor.phone,
        clinicId: doctor.clinic_id,
        clinicCode: doctor.clinic_code,
        status: doctor.status,
      },
      doctor: {
        id: doctorIdForToken,
        name: safeName,
        email: doctor.email,
        phone: doctor.phone,
        clinicId: doctor.clinic_id,
        clinicCode: doctor.clinic_code,
        role: "DOCTOR",
        type: "doctor",
        status: doctor.status,
      },
    });

  } catch (err) {
    console.error("[DOCTOR LOGIN] Error:", err);
    res.status(500).json({
      ok: false,
      error: "internal_error",
      details: err.message
    });
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

    // Check clinic limits and phone duplicate
    const { data: existingPatients, error: countError } = await supabase
      .from("patients")
      .select("patient_id, phone")
      .eq("clinic_code", clinicCode.trim());

    if (countError) {
      console.error("[PATIENT REGISTER] Count error:", countError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const patientCount = existingPatients?.length || 0;
    
    // Check for phone duplicate
    console.log("[PATIENT REGISTER] Checking phone duplicate:", {
      phone: phone.trim(),
      existingPhones: existingPatients?.map(p => p.phone)
    });
    const phoneExists = existingPatients?.some(p => p.phone === phone.trim());
    if (phoneExists) {
      console.log("[PATIENT REGISTER] Phone duplicate found:", phone.trim());
      return res.status(400).json({
        ok: false,
        error: "phone_already_exists",
        message: "Bu telefon numarası ile zaten bir kayıt bulunmaktadır."
      });
    }
    
    // Remove max patients check since clinics table doesn't have max_patients column

    // Generate patient ID
    const patient_id = crypto.randomUUID(); // ✅ Use proper UUID
    const referral_code = generateReferralCode();

    // Create patient with ACTIVE status
    console.log("[PATIENT REGISTER] Creating patient in table PATIENTS with role:", "PATIENT");
    
    const newPatient = {
      patient_id,
      name: patientName,
      phone: phone.trim(),
      email: email?.trim() || '',
      clinic_id: clinic.id, // ✅ Add clinic_id from clinic lookup
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
      
      // Handle duplicate constraint errors
      if (insertError.code === '23505') {
        if (insertError.message.includes('patients_email_unique')) {
          return res.status(400).json({
            ok: false,
            error: "email_already_exists",
            message: "Bu e-posta adresi ile zaten bir kayıt bulunmaktadır."
          });
        }
        
        if (insertError.message.includes('patients_phone_unique')) {
          return res.status(400).json({
            ok: false,
            error: "phone_already_exists",
            message: "Bu telefon numarası ile zaten bir kayıt bulunmaktadır."
          });
        }
      }
      
      return res.status(500).json({
        ok: false,
        error: "registration_failed",
        message: insertError.message || "Hasta kaydı başarısız oldu."
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
            referrer_id: referrer.patient_id, // ✅ Use patient_id instead of name
            referred_id: patient_id,
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
        patientId: patient_id, // ✅ Use patient_id instead of name
        clinicId: clinic.id,
        clinicCode: clinicCode.trim(),
        role: "PATIENT",
        roleType: "PATIENT"
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    console.log("[PATIENT REGISTER] Patient registered successfully:", {
      patientId: insertedPatient.patient_id,
      name: insertedPatient.name,
      role: "PATIENT",
      status: "ACTIVE"
    });

    res.json({
      ok: true,
      message: "Patient registration successful.",
      patientId: patient_id, // ✅ Use patient_id from insert result
      referralCode: referral_code, // ✅ Use generated referral_code
      name: patientName, // ✅ Use patientName from request
      phone: phone, // ✅ Use phone from request
      email: email, // ✅ Use email from request
      status: "ACTIVE", // ✅ Use constant status
      role: "PATIENT", // ✅ Use constant role
      token: patientToken, // ✅ Use generated token
    });
  } catch (err) {
    console.error("[PATIENT REGISTER] Error:", err);

    return res.status(500).json({
      ok: false,
      error: "registration_failed"
    });
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

    const resolveProfilePhotoUrl = async (candidateEmail, candidateName) => {
      const attempts = [];

      if (doctorId) {
        attempts.push(
          supabase
            .from("patients")
            .select("profile_photo_url")
            .eq("role", "DOCTOR")
            .eq("clinic_id", clinicId)
            .eq("patient_id", doctorId)
            .maybeSingle()
        );
      }

      const normalizedEmail = String(candidateEmail || "").trim().toLowerCase();
      if (normalizedEmail) {
        attempts.push(
          supabase
            .from("patients")
            .select("profile_photo_url")
            .eq("role", "DOCTOR")
            .eq("clinic_id", clinicId)
            .eq("email", normalizedEmail)
            .maybeSingle()
        );
      }

      const normalizedName = String(candidateName || "").trim();
      if (normalizedName) {
        attempts.push(
          supabase
            .from("patients")
            .select("profile_photo_url")
            .eq("role", "DOCTOR")
            .eq("clinic_id", clinicId)
            .eq("name", normalizedName)
            .maybeSingle()
        );
      }

      for (const queryPromise of attempts) {
        const { data, error } = await queryPromise;
        if (!error && data?.profile_photo_url) {
          return data.profile_photo_url;
        }
      }

      // Fallback: infer last uploaded doctor photo from storage path
      if (doctorId) {
        try {
          const folderPath = `doctor-profile/${clinicId}`;
          const { data: files, error: listError } = await supabase.storage
            .from(SUPABASE_STORAGE_BUCKET)
            .list(folderPath, {
              limit: 100,
              sortBy: { column: "name", order: "desc" },
            });

          if (!listError && Array.isArray(files)) {
            const doctorPrefix = `${doctorId}-`;
            const matched = files.find((file) => String(file?.name || "").startsWith(doctorPrefix));
            if (matched?.name) {
              const storagePath = `${folderPath}/${matched.name}`;
              const { data: publicData } = supabase.storage
                .from(SUPABASE_STORAGE_BUCKET)
                .getPublicUrl(storagePath);

              if (publicData?.publicUrl) {
                return publicData.publicUrl;
              }
            }
          }
        } catch (storageLookupError) {
          console.warn("[DOCTOR PROFILE ME] Storage photo lookup failed:", storageLookupError?.message || storageLookupError);
        }
      }

      return null;
    };

    // Fetch doctor from doctors table (support both auth id and legacy doctor_id in token)
    const { data: doctor, error } = await supabase
      .from("doctors")
      .select(`
        id,
        doctor_id,
        full_name,
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
      .or(`id.eq.${doctorId},doctor_id.eq.${doctorId}`)
      .maybeSingle();

    if (error || !doctor) {
      console.warn("[DOCTOR PROFILE ME] Doctor row not found, returning token fallback profile", {
        error: error?.message,
        doctorId,
        clinicId,
      });

      const fallbackName = String(v.decoded?.doctorName || "").trim() || "Doctor";
      const fallbackPhoto = await resolveProfilePhotoUrl(v.decoded?.email, fallbackName);
      return res.json({
        ok: true,
        doctor: {
          doctorId: String(doctorId || ""),
          name: fallbackName,
          email: String(v.decoded?.email || ""),
          phone: String(v.decoded?.phone || ""),
          department: v.decoded?.department || null,
          title: v.decoded?.title || null,
          experience_years: Number(v.decoded?.experience_years || 0) || 0,
          languages: Array.isArray(v.decoded?.languages) ? v.decoded.languages : [],
          specialties: Array.isArray(v.decoded?.specialties) ? v.decoded.specialties : [],
          status: "ACTIVE",
          clinic_code: v.decoded?.clinicCode || "",
          license_number: v.decoded?.license_number || null,
          profile_photo_url: fallbackPhoto,
        }
      });
    }

    const profilePhotoUrl = await resolveProfilePhotoUrl(doctor.email, doctor.full_name);

    res.json({
      ok: true,
      doctor: {
        doctorId: doctor.id,
        name: doctor.full_name,
        email: doctor.email,
        phone: doctor.phone,
        department: doctor.department,
        title: doctor.title,
        experience_years: doctor.experience_years,
        languages: doctor.languages,
        specialties: doctor.specialties,
        status: doctor.status,
        clinic_code: doctor.clinic_code,
        license_number: doctor.license_number,
        profile_photo_url: profilePhotoUrl,
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

    const { clinicId, doctorId } = v.decoded;
    
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
    if (name !== undefined) updatePayload.full_name = name;
    if (phone !== undefined) updatePayload.phone = phone;
    if (department !== undefined) updatePayload.department = department;
    if (title !== undefined) updatePayload.title = title;
    if (experience_years !== undefined) updatePayload.experience_years = experience_years;
    if (languages !== undefined) updatePayload.languages = languages;
    if (specialties !== undefined) updatePayload.specialties = specialties;

    // Update doctor in doctors table (support token doctorId variants)
    const { data: doctor, error } = await supabase
      .from("doctors")
      .update(updatePayload)
      .eq("role", "DOCTOR")
      .eq("clinic_id", clinicId)
      .or(`id.eq.${doctorId},doctor_id.eq.${doctorId}`)
      .select(`
        id,
        full_name,
        email,
        phone,
        department,
        title,
        experience_years,
        languages,
        specialties,
        status,
        clinic_code,
        license_number
      `)
      .maybeSingle();

    if (error) {
      console.error("[DOCTOR PROFILE ME UPDATE] Error:", error);
      return res.status(500).json({ ok: false, error: "update_failed" });
    }

    if (!doctor) {
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    res.json({
      ok: true,
      doctor: {
        doctorId: doctor.id,
        name: doctor.full_name,
        email: doctor.email,
        phone: doctor.phone,
        department: doctor.department,
        title: doctor.title,
        experience_years: doctor.experience_years,
        languages: doctor.languages,
        specialties: doctor.specialties,
        status: doctor.status,
        clinic_code: doctor.clinic_code,
        license_number: doctor.license_number
      }
    });
  } catch (err) {
    console.error("[DOCTOR PROFILE ME UPDATE] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR PROFILE PHOTO UPLOAD ================= */
app.post("/api/doctor/upload-photo", doctorPhotoUpload.single("photo"), async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { clinicId, doctorId } = v.decoded;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ ok: false, error: "no_file" });
    }

    const extensionByMime = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/heic": ".heic",
      "image/heif": ".heif",
    };

    const fallbackExt = extensionByMime[file.mimetype] || ".jpg";
    const originalExt = path.extname(file.originalname || "").toLowerCase();
    const fileExt = originalExt || fallbackExt;
    const filePath = `doctor-profile/${clinicId}/${doctorId}-${Date.now()}${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      console.error("[DOCTOR PHOTO UPLOAD] Storage error:", uploadError);
      return res.status(500).json({ ok: false, error: "storage_upload_failed" });
    }

    const { data: urlData } = supabase.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .getPublicUrl(filePath);

    const profilePhotoUrl =
      urlData?.publicUrl ||
      `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${filePath}`;

    const tokenEmail = String(v.decoded?.email || "").trim().toLowerCase();

    let updateSucceeded = false;

    if (doctorId) {
      const { data: byPatientIdData, error: byPatientIdError } = await supabase
        .from("patients")
        .update({ profile_photo_url: profilePhotoUrl })
        .eq("role", "DOCTOR")
        .eq("clinic_id", clinicId)
        .eq("patient_id", doctorId)
        .select("id")
        .limit(1);

      if (!byPatientIdError && Array.isArray(byPatientIdData) && byPatientIdData.length > 0) {
        updateSucceeded = true;
      }
    }

    if (!updateSucceeded && tokenEmail) {
      const { data: byEmailData, error: byEmailError } = await supabase
        .from("patients")
        .update({ profile_photo_url: profilePhotoUrl })
        .eq("role", "DOCTOR")
        .eq("clinic_id", clinicId)
        .eq("email", tokenEmail)
        .select("id")
        .limit(1);

      if (!byEmailError && Array.isArray(byEmailData) && byEmailData.length > 0) {
        updateSucceeded = true;
      }
    }

    if (!updateSucceeded) {
      console.warn("[DOCTOR PHOTO UPLOAD] Could not persist profile_photo_url to patients row", {
        doctorId,
        clinicId,
        email: tokenEmail || null,
      });
    }

    return res.json({
      ok: true,
      profilePhotoUrl: profilePhotoUrl,
      persisted: updateSucceeded,
    });
  } catch (err) {
    console.error("[DOCTOR PHOTO UPLOAD] Error:", err);
    return res.status(500).json({ ok: false, error: "internal_error" });
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
// app.get("/api/admin/patients/:patientId/treatment-group", adminAuth, async (req, res) => {
//   try {
//     const { patientId } = req.params;
//
//     if (!patientId) {
//       return res.status(400).json({ ok: false, error: "patientId_required" });
//     }
//
//     console.log("[ADMIN PATIENT TREATMENT GROUP] Request:", { patientId });
//
//     // Get patient's treatment group assignment
//     const { data: assignment, error: assignmentError } = await supabase
//       .from("patient_group_assignments")
//       .select(`
//         treatment_group_id,
//         treatment_groups!inner(
//           id,
//           name,
//           description,
//           status,
//           created_at
//         )
//       `)
//       .eq("id", patientId)
//       .eq("treatment_groups.clinic_id", req.admin.clinicId)
//       .single();
//
//     if (assignmentError && assignmentError.code !== 'PGRST116') {
//       console.error("[ADMIN PATIENT TREATMENT GROUP] Assignment error:", assignmentError);
//       return res.status(500).json({ ok: false, error: "assignment_check_failed" });
//     }
//
//     if (!assignment) {
//       return res.json({ ok: true, treatmentGroup: null });
//     }
//
//     // Get group members
//     const { data: members, error: membersError } = await supabase
//       .from("treatment_group_members")
//       .select(`
//         doctor_id,
//         is_primary,
//         patients!inner(
//           id,
//           name,
          //           department
//         )
//       `)
//       .eq("treatment_group_id", assignment.treatment_group_id)
//       .eq("patients.clinic_id", req.admin.clinicId);
//
//     if (membersError) {
//       console.error("[ADMIN PATIENT TREATMENT GROUP] Members error:", membersError);
//       return res.status(500).json({ ok: false, error: "members_check_failed" });
//     }
//
//     const treatmentGroup = {
//       ...assignment.treatment_groups,
//       members: members ? members.map(member => ({
//         doctor_id: member.doctor_id,
//         doctor_name: member.patients.name,
//         department: member.patients.department,
//         is_primary: member.is_primary
//       })) : []
//     };
//
//     console.log("[ADMIN PATIENT TREATMENT GROUP] Success:", {
//       patientId,
//       groupId: treatmentGroup.id,
//       memberCount: treatmentGroup.members.length
//     });
//
//     res.json({
//       ok: true,
//       treatmentGroup
//     });
//   } catch (err) {
//     console.error("REGISTER_DOCTOR_ERROR:", err);
//     console.error("[ADMIN PATIENT TREATMENT GROUP] Error:", err);
//     res.status(500).json({ ok: false, error: "internal_error" });
//   }
// });

/* ================= ADMIN TREATMENT GROUPS CREATE ================= */
app.post("/api/admin/treatment-groups", adminAuth, async (req, res) => {
  try {
    const { patient_id } = req.body;

    if (!patient_id) {
      return res.status(400).json({
        ok: false,
        error: "patient_id zorunludur"
      });
    }

    const clinicId = req.admin.clinicId;

    // 1️⃣ Hastayı getir
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, name")
      .eq("id", patient_id)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({
        ok: false,
        error: "Hasta bulunamadı"
      });
    }

    // 2️⃣ Mevcut group sayısını bul
    const { count, error: countError } = await supabase
      .from("treatment_groups")
      .select("*", { count: "exact", head: true })
      .eq("patient_id", patient_id);

    if (countError) {
      return res.status(500).json({
        ok: false,
        error: "Group sayısı alınamadı"
      });
    }

    const nextNumber = (count || 0) + 1;
    const autoName = `${patient.name} ${nextNumber}`;

    // 3️⃣ Group oluştur (TEMPORARILY DISABLED)
    // const { data: group, error: groupError } = await supabase
    //   .from("treatment_groups")
    //   .insert({
    //     group_name: autoName,
    //     patient_id,
    //     clinic_id: clinicId,
    //     status: "OPEN"
    //   })
    //   .select()
    //   .single();

    // if (groupError) {
    //   return res.status(500).json({
    //     ok: false,
    //     error: groupError.message
    //   });
    // }

    // Return success without creating group
    return res.json({
      ok: true,
      message: "Treatment endpoint redirected - no group created"
    });

  } catch (err) {
    console.error("Create treatment group error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

/* ================= ADMIN TREATMENTS CREATE ================= */
app.post("/api/admin/treatments", adminAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id, tooth_number, icd_code, description } = req.body;

    if (!patient_id || !doctor_id || !tooth_number) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    if (!isSupabaseEnabled()) {
      return res.status(500).json({ ok: false, error: "supabase_not_configured" });
    }

    // Fetch patient
    const { data: patient, error: fetchError } = await supabase
      .from("patients")
      .select("id, treatments")
      .eq("id", patient_id)
      .single();

    if (fetchError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    let treatments = patient.treatments || { teeth: {} };

    if (typeof treatments === "string") {
      try {
        treatments = JSON.parse(treatments);
      } catch {
        treatments = { teeth: {} };
      }
    }

    if (!treatments.teeth) {
      treatments.teeth = {};
    }

    if (!treatments.teeth[tooth_number]) {
      treatments.teeth[tooth_number] = [];
    }

    treatments.teeth[tooth_number].push({
      id: crypto.randomUUID(),
      doctor_id,
      icd_code: icd_code || null,
      description: description || "",
      date: new Date().toISOString()
    });

    const { error: updateError } = await supabase
      .from("patients")
      .update({ treatments })
      .eq("id", patient_id);

    if (updateError) {
      return res.status(500).json({ ok: false, error: "update_failed" });
    }

    res.json({ ok: true });

  } catch (err) {
    console.error("Treatment create error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= TREATMENT GROUPS (ROLE BASED LIST) ================= */
// app.get("/api/treatment-groups", async (req, res) => {
//   try {
//     const patientId = String(req.query.patientId || "").trim();
//     if (!patientId) {
//       return res.status(400).json({
//         ok: false,
//         error: "patient_id_required"
//       });
//     }
// 
//     const authHeader = req.headers.authorization;
//     if (!authHeader?.startsWith("Bearer ")) {
//       return res.status(401).json({
//         ok: false,
//         error: "missing_token"
//       });
//     }
// 
//     const token = authHeader.substring(7);
//
//     let decoded;
//     try {
//       decoded = jwt.verify(token, JWT_SECRET);
//     } catch (err) {
//       return res.status(401).json({
//         ok: false,
//         error: "invalid_token"
//       });
//     }
//
//     const role = decoded.role;
//     const clinicId = decoded.clinicId;
//     const doctorId = decoded.doctorId || decoded.userId;
//
//     if (!role || !clinicId) {
//       return res.status(401).json({
//         ok: false,
//         error: "invalid_token_payload"
//       });
//     }
//
//     // ---- Admin: Tüm clinic grupları ----
//     if (role === "ADMIN") {
//       const { data, error } = await supabase
//         .from("treatment_groups")
//         .select("*")
//         .eq("clinic_id", clinicId)
//         .eq("patient_id", patientId)
//         .order("created_at", { ascending: false });
//
//       if (error) {
//         return res.status(500).json({
//           ok: false,
//           error: "fetch_failed",
//           message: error.message
//         });
//       }
//
//       const filtered = (data || []).filter(group =>
//         group.primary_doctor_id === doctorId ||
//         (Array.isArray(group.doctor_ids) &&
//           group.doctor_ids.includes(doctorId))
//       );
//
//       return res.json({
//         ok: true,
//         data: filtered
//       });
//     }
//
//     // ---- Doctor: Sadece kendi grupları ----
//     if (role === "DOCTOR") {
//       const { data, error } = await supabase
//         .from("treatment_groups")
//         .select("*")
//         .eq("clinic_id", clinicId)
//         .eq("patient_id", patientId)
//         .order("created_at", { ascending: false });
//
//       if (error) {
//         return res.status(500).json({
//           ok: false,
//           error: "fetch_failed",
//           message: error.message
//         });
//       }
//
//       const filtered = (data || []).filter(group =>
//         group.primary_doctor_id === doctorId ||
//         (Array.isArray(group.doctor_ids) &&
//           group.doctor_ids.includes(doctorId))
//       );
//
//       return res.json({
//         ok: true,
//         data: filtered
//       });
//     }
//
//     return res.status(403).json({
//       ok: false,
//       error: "forbidden"
//     });
//
//   } catch (err) {
//     console.error("TREATMENT_GROUPS_LIST_ERROR:", err);
//     return res.status(500).json({
//       ok: false,
//       error: "internal_server_error"
//     });
//   }
// });

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
app.get("/api/doctor/tasks", async (req, res) => {
  let completed = false;
  const safeJson = (statusCode, payload) => {
    if (completed || res.headersSent) return;
    completed = true;
    res.status(statusCode).json(payload);
  };

  const hardDeadline = setTimeout(() => {
    console.warn("[DOCTOR TASKS] hard deadline reached, returning fallback empty tasks");
    safeJson(200, { ok: true, tasks: [] });
  }, 8500);

  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return safeJson(401, { ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;

    const withTimeout = async (promise, ms, label) => {
      let timeoutId;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const procedureSelectCandidates = [
      "id, treatment_plan_id, patient_id, doctor_id, title, procedure_name, procedure_code, tooth_number, due_date, scheduled_date, status, priority, created_at, updated_at",
      "id, treatment_plan_id, patient_id, doctor_id, title, procedure_code, tooth_number, due_date, scheduled_date, status, priority, created_at, updated_at",
      "id, treatment_plan_id, patient_id, doctor_id, title, procedure_code, tooth_id, scheduled_date, status, created_at, updated_at",
      "id, treatment_plan_id, patient_id, doctor_id, title, status, scheduled_date, created_at, updated_at",
    ];

    let procedures = [];
    let proceduresError = null;

    for (const selectClause of procedureSelectCandidates) {
      const result = await withTimeout(
        supabase
          .from("procedures")
          .select(selectClause)
          .eq("doctor_id", doctorId)
          .in("status", ["PLANNED", "IN_PROGRESS", "planned", "in_progress"])
          .order("created_at", { ascending: false }),
        7000,
        "procedures_query"
      );

      if (!result?.error) {
        procedures = Array.isArray(result?.data) ? result.data : [];
        proceduresError = null;
        break;
      }

      proceduresError = result.error;
      if (!["42703", "PGRST204", "PGRST205"].includes(String(result.error?.code || ""))) {
        break;
      }
    }

    if (proceduresError && !["42703", "PGRST204", "PGRST205"].includes(String(proceduresError?.code || ""))) {
      console.error("[DOCTOR TASKS] procedures query error:", proceduresError);
      return safeJson(200, { ok: true, tasks: [] });
    }

    let treatmentItems = [];
    if (procedures.length === 0) {
      const treatmentItemsSelectCandidates = [
        "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, procedure_description, status, category, type, scheduled_at, scheduled_date, due_date, created_at, updated_at, treatment_plans!inner(id, created_by_doctor_id, assigned_doctor_id, patient_encounters!left(id, patient_id))",
        "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, scheduled_at, scheduled_date, due_date, created_at, updated_at, treatment_plans!inner(id, created_by_doctor_id, assigned_doctor_id, patient_encounters!left(id, patient_id))",
        "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, scheduled_at, due_date, created_at, treatment_plans!inner(id, created_by_doctor_id, patient_encounters!left(id, patient_id))",
      ];

      for (const selectClause of treatmentItemsSelectCandidates) {
        const result = await withTimeout(
          supabase
            .from("treatment_items")
            .select(selectClause)
            .eq("treatment_plans.created_by_doctor_id", doctorId)
            .in("status", ["PLANNED", "IN_PROGRESS", "planned", "in_progress"])
            .order("created_at", { ascending: false }),
          7000,
          "treatment_items_query"
        );

        if (!result?.error) {
          treatmentItems = Array.isArray(result?.data) ? result.data : [];
          break;
        }

        if (!["42703", "PGRST204", "PGRST200", "PGRST201", "PGRST205"].includes(String(result.error?.code || ""))) {
          console.warn("[DOCTOR TASKS] treatment_items query error:", result.error);
          break;
        }
      }
    }

    if (procedures.length === 0 && treatmentItems.length === 0) {
      try {
        const ownerCandidates = await resolveEncounterDoctorOwnerCandidates(v.decoded);
        const doctorOwnerKeys = [...new Set([String(doctorId || "").trim(), ...(ownerCandidates || [])].filter(Boolean))];

        const mergedPlans = [];
        const planSelectCandidates = [
          "id, encounter_id, created_by_doctor_id, assigned_doctor_id, created_at",
          "id, encounter_id, created_by_doctor_id, created_at",
          "id, encounter_id, created_at",
        ];

        for (const ownerKey of doctorOwnerKeys) {
          let fetchedForKey = false;
          for (const selectClause of planSelectCandidates) {
            const planResult = await withTimeout(
              supabase
                .from("treatment_plans")
                .select(selectClause)
                .or(`created_by_doctor_id.eq.${ownerKey},assigned_doctor_id.eq.${ownerKey}`)
                .order("created_at", { ascending: false }),
              7000,
              "task_plan_fallback_query"
            );

            if (!planResult?.error) {
              mergedPlans.push(...(planResult.data || []));
              fetchedForKey = true;
              break;
            }

            const code = String(planResult.error?.code || "");
            if (["22P02", "42703", "PGRST204", "PGRST205"].includes(code)) {
              continue;
            }
            fetchedForKey = true;
            break;
          }

          if (!fetchedForKey) continue;
        }

        const plans = Array.from(
          new Map((mergedPlans || []).map((plan) => [String(plan?.id || ""), plan])).values()
        );

        const planMap = new Map(plans.map((plan) => [String(plan.id), plan]));
        const encounterIds = Array.from(new Set(plans.map((plan) => String(plan?.encounter_id || "").trim()).filter(Boolean)));
        const planIds = Array.from(new Set(plans.map((plan) => String(plan?.id || "").trim()).filter(Boolean)));

        const encounterPatientMap = new Map();
        if (encounterIds.length > 0) {
          const encounterResult = await withTimeout(
            supabase
              .from("patient_encounters")
              .select("id, patient_id")
              .in("id", encounterIds),
            5000,
            "task_encounter_patient_fallback_query"
          );

          if (!encounterResult?.error) {
            for (const row of encounterResult.data || []) {
              encounterPatientMap.set(String(row.id), row?.patient_id || null);
            }
          }
        }

        if (planIds.length > 0) {
          const itemSelectCandidates = [
            "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, procedure_description, status, category, type, scheduled_at, scheduled_date, due_date, created_at, updated_at",
            "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, scheduled_date, due_date, created_at, updated_at",
            "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, created_at, updated_at",
          ];

          for (const selectClause of itemSelectCandidates) {
            const itemResult = await withTimeout(
              supabase
                .from("treatment_items")
                .select(selectClause)
                .in("treatment_plan_id", planIds)
                .order("created_at", { ascending: false }),
              7000,
              "task_items_fallback_query"
            );

            if (!itemResult?.error) {
              treatmentItems = (itemResult.data || []).map((item) => {
                const plan = planMap.get(String(item?.treatment_plan_id || "")) || null;
                const encounterId = String(plan?.encounter_id || "").trim();
                const patientId = encounterPatientMap.get(encounterId) || null;
                return {
                  ...item,
                  treatment_plans: {
                    id: plan?.id || item?.treatment_plan_id || null,
                    created_by_doctor_id: plan?.created_by_doctor_id || null,
                    assigned_doctor_id: plan?.assigned_doctor_id || null,
                    patient_encounters: {
                      patient_id: patientId,
                    },
                  },
                };
              });
              break;
            }

            const code = String(itemResult.error?.code || "");
            if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
              break;
            }
          }
        }
      } catch (fallbackErr) {
        console.warn("[DOCTOR TASKS] plan/item fallback warning:", fallbackErr?.message || fallbackErr);
      }
    }

    const patientIds = Array.from(
      new Set(
        [
          ...procedures.map((p) => p?.patient_id),
          ...treatmentItems.map((item) => item?.treatment_plans?.patient_encounters?.patient_id),
        ].filter(Boolean)
      )
    );

    let patientMap = new Map();
    if (patientIds.length > 0) {
      try {
        const patientsResult = await withTimeout(
          supabase
            .from("patients")
            .select("id, patient_id, name, full_name, first_name, last_name")
            .in("id", patientIds),
          5000,
          "task_patients_query"
        );

        const patients = Array.isArray(patientsResult?.data) ? patientsResult.data : [];
        patientMap = new Map(patients.map((p) => [String(p.id), p]));
      } catch (patientError) {
        console.warn("[DOCTOR TASKS] patient lookup timeout/failure:", patientError?.message || patientError);
      }
    }

    const now = Date.now();
    const sanitizeName = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";

      const normalized = text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-zçğıöşü0-9 ]/gi, "")
        .trim();

      if (!normalized) return "";
      if (["unknown", "unknown unknown", "null", "undefined", "n/a", "na", "-", "--"].includes(normalized)) {
        return "";
      }

      return text;
    };
    const procedureTasks = procedures
      .map((procedure) => {
        const status = String(procedure?.status || "").toUpperCase();
        if (!["PLANNED", "IN_PROGRESS"].includes(status)) {
          return null;
        }

        const patient = patientMap.get(String(procedure?.patient_id || "")) || null;
        const legacyName = sanitizeName(patient?.name);
        const fullName = sanitizeName(patient?.full_name);
        const firstName = sanitizeName(patient?.first_name);
        const lastName = sanitizeName(patient?.last_name);
        const mergedName = sanitizeName(`${firstName} ${lastName}`.trim());
        const displayName = legacyName || fullName || mergedName || "Unknown Patient";

        const dueDateRaw =
          procedure?.due_date ||
          procedure?.scheduled_date ||
          procedure?.planned_date ||
          null;
        const dueDateTs = dueDateRaw ? new Date(dueDateRaw).getTime() : null;

        const rawPriority = String(procedure?.priority || "").toUpperCase();
        const isHighPriority = rawPriority === "HIGH" || rawPriority === "URGENT";

        return {
          id: procedure.id,
          procedure_id: procedure.id,
          assigned_doctor_id: procedure.doctor_id || doctorId,
          treatment_plan_id: procedure.treatment_plan_id || null,
          patient_id: procedure.patient_id || null,
          tooth_number: procedure.tooth_number || procedure.tooth_fdi_code || procedure.tooth_id || null,
          procedure_name:
            procedure.title ||
            procedure.procedure_name ||
            procedure.procedure_code ||
            "Procedure",
          due_date: dueDateRaw,
          status,
          priority: rawPriority || null,
          high_priority: isHighPriority,
          overdue: !!dueDateTs && dueDateTs < now,
          created_at: procedure.created_at || null,
          updated_at: procedure.updated_at || null,
          patient: {
            id: patient?.id || procedure.patient_id || null,
            patient_id: patient?.patient_id || null,
            name: displayName,
          },
          task_source: "PROCEDURE",
        };
      })
      .filter(Boolean);

    const treatmentItemTasks = treatmentItems
      .map((item) => {
        const status = String(item?.status || "").toUpperCase();
        if (!["PLANNED", "IN_PROGRESS"].includes(status)) {
          return null;
        }

        const patientId = item?.treatment_plans?.patient_encounters?.patient_id || null;
        const patient = patientMap.get(String(patientId || "")) || null;
        const legacyName = sanitizeName(patient?.name);
        const fullName = sanitizeName(patient?.full_name);
        const firstName = sanitizeName(patient?.first_name);
        const lastName = sanitizeName(patient?.last_name);
        const mergedName = sanitizeName(`${firstName} ${lastName}`.trim());
        const displayName = legacyName || fullName || mergedName || "Unknown Patient";

        const dueDateRaw =
          item?.scheduled_at ||
          item?.scheduledAt ||
          item?.scheduled_date ||
          item?.due_date ||
          null;
        const dueDateTs = dueDateRaw ? new Date(dueDateRaw).getTime() : null;

        return {
          id: item.id,
          treatment_item_id: item.id,
          assigned_doctor_id:
            item?.treatment_plans?.assigned_doctor_id ||
            item?.treatment_plans?.created_by_doctor_id ||
            doctorId,
          treatment_plan_id: item.treatment_plan_id || item?.treatment_plans?.id || null,
          patient_id: patientId,
          tooth_number: item.tooth_fdi_code || null,
          procedure_name:
            item.procedure_description ||
            item.procedure_name ||
            item.procedure_code ||
            "Procedure",
          procedure_category: item.category || item.type || null,
          due_date: dueDateRaw,
          status,
          priority: null,
          high_priority: false,
          overdue: !!dueDateTs && dueDateTs < now,
          created_at: item.created_at || null,
          updated_at: item.updated_at || null,
          patient: {
            id: patient?.id || patientId || null,
            patient_id: patient?.patient_id || null,
            name: displayName,
          },
          task_source: "TREATMENT_ITEM",
        };
      })
      .filter(Boolean);

    const formattedTasks = [...procedureTasks, ...treatmentItemTasks]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());

    console.log("[DOCTOR TASKS] Success:", {
      doctorId,
      taskCount: formattedTasks.length
    });

    safeJson(200, {
      ok: true,
      tasks: formattedTasks
    });

  } catch (err) {
    console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[DOCTOR TASKS] Error:", err);
    safeJson(500, { ok: false, error: "internal_error" });
  } finally {
    clearTimeout(hardDeadline);
  }
});

app.patch("/api/admin/calendar/tasks/:taskId/confirm", adminAuth, async (req, res) => {
  try {
    const taskId = String(req.params.taskId || "").trim();
    const doctorId = String(req.body?.doctorId || "").trim();
    const requestedStatus = String(req.body?.status || "CONFIRMED").trim().toUpperCase();
    const startTimeIso = toIsoOrNull(req.body?.startTime);
    const endTimeIso = toIsoOrNull(req.body?.endTime) || (startTimeIso ? addMinutesIso(startTimeIso, 30) : null);

    if (!taskId) {
      return res.status(400).json({ ok: false, error: "task_id_required" });
    }

    if (!doctorId) {
      return res.status(400).json({ ok: false, error: "doctor_id_required" });
    }

    if (!startTimeIso || !endTimeIso) {
      return res.status(400).json({ ok: false, error: "start_end_required" });
    }

    const clinicId = req.admin?.clinicId;
    const doctorRes = await supabase
      .from("doctors")
      .select("id, clinic_id, role")
      .eq("id", doctorId)
      .eq("clinic_id", clinicId)
      .eq("role", "DOCTOR")
      .limit(1)
      .maybeSingle();

    if (doctorRes.error || !doctorRes.data) {
      return res.status(404).json({ ok: false, error: "doctor_not_found" });
    }

    const hasConflict = await hasDoctorConflict(doctorId, startTimeIso, endTimeIso, taskId);
    if (hasConflict) {
      return res.status(409).json({ ok: false, error: "doctor_time_conflict" });
    }

    const normalizedStatus = requestedStatus === "DONE" ? "DONE" : "CONFIRMED";
    const statusCandidates = normalizedStatus === "DONE"
      ? ["DONE", "done", "COMPLETED", "completed"]
      : ["CONFIRMED", "confirmed", "PLANNED", "planned"];

    const updateCandidates = statusCandidates.map((statusValue) => ({
      doctor_id: doctorId,
      start_time: startTimeIso,
      end_time: endTimeIso,
      scheduled_date: startTimeIso,
      due_date: startTimeIso,
      scheduled_by: "ADMIN",
      suggested_by_doctor: false,
      status: statusValue,
    }));

    const fallbackUpdateCandidates = statusCandidates.map((statusValue) => ({
      doctor_id: doctorId,
      scheduled_date: startTimeIso,
      due_date: startTimeIso,
      status: statusValue,
    }));

    let updated = null;
    let lastError = null;

    for (const payload of [...updateCandidates, ...fallbackUpdateCandidates]) {
      const attempt = await supabase
        .from("procedures")
        .update(payload)
        .eq("id", taskId)
        .select("id, doctor_id, status, start_time, end_time, scheduled_date, due_date")
        .single();

      if (!attempt.error && attempt.data) {
        updated = attempt.data;
        lastError = null;
        break;
      }

      lastError = attempt.error;
      const code = String(attempt.error?.code || "");
      if (!["42703", "PGRST204", "22P02", "23514"].includes(code)) {
        break;
      }
    }

    if (!updated) {
      return res.status(500).json({ ok: false, error: "calendar_confirm_failed", details: lastError?.message || null });
    }

    return res.json({
      ok: true,
      task: {
        id: updated.id,
        doctorId: updated.doctor_id || doctorId,
        status: normalizedStatus,
        startTime: toIsoOrNull(updated.start_time || updated.scheduled_date || updated.due_date) || startTimeIso,
        endTime: toIsoOrNull(updated.end_time) || endTimeIso,
        scheduledBy: "ADMIN",
      },
    });
  } catch (error) {
    console.error("[ADMIN CALENDAR CONFIRM] error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.patch("/api/doctor/calendar/tasks/:taskId/suggest", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const taskId = String(req.params.taskId || "").trim();
    const doctorId = String(v.decoded?.doctorId || "").trim();
    const startTimeIso = toIsoOrNull(req.body?.startTime);
    const endTimeIso = toIsoOrNull(req.body?.endTime) || (startTimeIso ? addMinutesIso(startTimeIso, 30) : null);

    if (!taskId || !startTimeIso || !endTimeIso) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }

    const lookup = await getDoctorProcedureById(taskId);
    if (lookup.error) {
      return res.status(500).json({ ok: false, error: "task_lookup_failed" });
    }

    if (!lookup.data) {
      return res.status(404).json({ ok: false, error: "task_not_found" });
    }

    if (String(lookup.data?.doctor_id || "") !== doctorId) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const hasConflict = await hasDoctorConflict(doctorId, startTimeIso, endTimeIso, taskId);
    if (hasConflict) {
      return res.status(409).json({ ok: false, error: "doctor_time_conflict" });
    }

    const updateCandidates = [
      {
        start_time: startTimeIso,
        end_time: endTimeIso,
        scheduled_date: startTimeIso,
        due_date: startTimeIso,
        scheduled_by: "DOCTOR",
        suggested_by_doctor: true,
        status: "PENDING",
      },
      {
        scheduled_date: startTimeIso,
        due_date: startTimeIso,
        status: "planned",
      },
    ];

    let updated = null;
    let lastError = null;
    for (const payload of updateCandidates) {
      const attempt = await supabase
        .from("procedures")
        .update(payload)
        .eq("id", taskId)
        .eq("doctor_id", doctorId)
        .select("id, doctor_id, status, start_time, end_time, scheduled_date, due_date")
        .single();

      if (!attempt.error && attempt.data) {
        updated = attempt.data;
        lastError = null;
        break;
      }

      lastError = attempt.error;
      const code = String(attempt.error?.code || "");
      if (!["42703", "PGRST204", "22P02", "23514"].includes(code)) {
        break;
      }
    }

    if (!updated) {
      return res.status(500).json({ ok: false, error: "suggest_failed", details: lastError?.message || null });
    }

    return res.json({
      ok: true,
      task: {
        id: updated.id,
        doctorId,
        status: "PENDING",
        startTime: toIsoOrNull(updated.start_time || updated.scheduled_date || updated.due_date) || startTimeIso,
        endTime: toIsoOrNull(updated.end_time) || endTimeIso,
        scheduledBy: "DOCTOR",
        suggestedByDoctor: true,
      },
    });
  } catch (error) {
    console.error("[DOCTOR CALENDAR SUGGEST] error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR UPDATE TASK STATUS ================= */
app.patch("/api/doctor/tasks/:taskId", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;
    const { taskId } = req.params;
    const { status } = req.body;

    const normalizedStatus = String(status || "").trim().toUpperCase();
    if (!normalizedStatus || !["PLANNED", "IN_PROGRESS", "DONE", "CANCELLED"].includes(normalizedStatus)) {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }

    const { data: procedure, error: procedureError } = await supabase
      .from("procedures")
      .select("id, doctor_id, status")
      .eq("id", taskId)
      .eq("doctor_id", doctorId)
      .limit(1)
      .maybeSingle();

    if (procedureError || !procedure) {
      console.error("[DOCTOR UPDATE TASK] Procedure not found:", procedureError);
      return res.status(404).json({ ok: false, error: "task_not_found" });
    }

    const statusCandidates = [normalizedStatus, normalizedStatus.toLowerCase()];
    let updatedTask = null;
    let updateError = null;

    for (const statusCandidate of statusCandidates) {
      const attempt = await supabase
        .from("procedures")
        .update({ status: statusCandidate })
        .eq("id", taskId)
        .eq("doctor_id", doctorId)
        .select("id, status, updated_at")
        .single();

      if (!attempt.error && attempt.data) {
        updatedTask = attempt.data;
        updateError = null;
        break;
      }

      updateError = attempt.error;
      if (!["22P02", "23514", "PGRST204"].includes(String(attempt.error?.code || ""))) {
        break;
      }
    }

    if (updateError || !updatedTask) {
      console.error("[DOCTOR UPDATE TASK] Update error:", updateError);
      return res.status(500).json({ ok: false, error: "task_update_failed" });
    }

    console.log("[DOCTOR UPDATE TASK] Success:", {
      taskId,
      doctorId,
      oldStatus: procedure.status,
      newStatus: normalizedStatus
    });

    res.json({
      ok: true,
      task: {
        id: updatedTask.id,
        status: String(updatedTask.status || normalizedStatus).toUpperCase(),
        updated_at: updatedTask.updated_at,
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

/* ================= ADMIN ASSIGN PATIENT ================= */
app.post("/api/admin/assign-patient", adminAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id } = req.body;

    if (!patient_id || !doctor_id) {
      return res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
    }

    const clinicId = req.admin.clinicId;

    // Validate patient
    const { data: patient } = await supabase
      .from("patients")
      .select("id, clinic_id")
      .eq("id", patient_id)
      .eq("clinic_id", clinicId)
      .single();

    if (!patient) {
      return res.status(404).json({
        ok: false,
        error: "patient_not_found_in_clinic"
      });
    }

    // Validate doctor
    const { data: doctor } = await supabase
      .from("doctors")
      .select("id, clinic_id, status")
      .eq("id", doctor_id)
      .eq("clinic_id", clinicId)
      .eq("status", "APPROVED")
      .single();

    if (!doctor) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_found_or_not_active"
      });
    }

    // Update patient with primary doctor
    const { error: updateError } = await supabase
      .from("patients")
      .update({ primary_doctor_id: doctor_id })
      .eq("id", patient_id)
      .eq("clinic_id", clinicId);

    if (updateError) {
      console.error("[ADMIN ASSIGN PATIENT] Update error:", updateError);
      return res.status(500).json({
        ok: false,
        error: "assignment_failed"
      });
    }

    console.log("[ADMIN ASSIGN PATIENT] Success:", {
      patient_id,
      primaryDoctorId: doctor_id,
      assignmentType: "primary_only"
    });

    return res.status(200).json({
      ok: true,
      data: {
        patient_id,
        primaryDoctorId: doctor_id,
        assignmentType: "primary_only"
      }
    });

  } catch (error) {
    console.error("[ADMIN ASSIGN PATIENT] Error:", error);
    return res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

/* ================= ADMIN VISITS ================= */
app.get("/api/admin/patients/:patientId/visits", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin?.clinicId;

    if (!patientId || !clinicId) {
      return res.status(400).json({ ok: false, error: "patient_and_clinic_required" });
    }

    const { data: visits, error } = await supabase
      .from("visits")
      .select("id, clinic_id, patient_id, visit_date, notes, created_at, updated_at")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("visit_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN VISITS GET] error:", error);
      return res.status(500).json({ ok: false, error: "visits_fetch_failed" });
    }

    res.json({ ok: true, visits: visits || [] });
  } catch (error) {
    console.error("[ADMIN VISITS GET] fatal:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/admin/patients/:patientId/visits", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin?.clinicId;
    const { visit_date, notes } = req.body || {};

    if (!patientId || !clinicId) {
      return res.status(400).json({ ok: false, error: "patient_and_clinic_required" });
    }

    if (!visit_date) {
      return res.status(400).json({ ok: false, error: "visit_date_required" });
    }

    const payload = {
      clinic_id: clinicId,
      patient_id: patientId,
      visit_date,
      notes: notes ? String(notes).trim() : null,
    };

    const { data: visit, error } = await supabase
      .from("visits")
      .insert(payload)
      .select("id, clinic_id, patient_id, visit_date, notes, created_at, updated_at")
      .single();

    if (error) {
      console.error("[ADMIN VISITS POST] error:", error);
      return res.status(500).json({ ok: false, error: "visit_create_failed" });
    }

    res.json({ ok: true, visit });
  } catch (error) {
    console.error("[ADMIN VISITS POST] fatal:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN VISIT-BASED TREATMENT BOARD ================= */
app.get("/api/admin/patients/:patientId/visit-treatment", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin?.clinicId;

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required" });
    }

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, name")
      .eq("id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (patientError || !patient) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const visitsResult = await supabase
      .from("visits")
      .select("id, patient_id, visit_date, notes, created_at")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("visit_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (visitsResult.error) {
      console.error("[ADMIN VISIT BOARD] visits fetch error:", visitsResult.error);
      return res.status(500).json({ ok: false, error: "visits_fetch_failed" });
    }

    const visits = Array.isArray(visitsResult.data) ? visitsResult.data : [];
    const visitIds = visits.map((v) => v.id).filter(Boolean);

    const diagnosesResult = await supabase
      .from("visit_diagnoses")
      .select("id, clinic_id, patient_id, visit_id, icd10_code, icd10_description, created_at")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (diagnosesResult.error) {
      console.error("[ADMIN VISIT BOARD] visit_diagnoses fetch error:", diagnosesResult.error);
      return res.status(500).json({ ok: false, error: "visit_diagnoses_schema_not_ready" });
    }

    const treatmentsResult = await supabase
      .from("treatments")
      .select("id, clinic_id, patient_id, visit_id, tooth_number, procedure_code, procedure_name, notes, status, created_at")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (treatmentsResult.error) {
      console.error("[ADMIN VISIT BOARD] treatments fetch error:", treatmentsResult.error);
      return res.status(500).json({ ok: false, error: "treatments_schema_not_ready" });
    }

    const diagnoses = Array.isArray(diagnosesResult.data) ? diagnosesResult.data : [];
    const treatments = Array.isArray(treatmentsResult.data) ? treatmentsResult.data : [];

    if (visits.length === 0) {
      const legacyPlansResult = await supabase
        .from("treatment_plans")
        .select("id, encounter_id, created_at, patient_encounters!left(id, patient_id)")
        .eq("patient_encounters.patient_id", patientId)
        .order("created_at", { ascending: false });

      if (!legacyPlansResult.error) {
        const legacyPlans = Array.isArray(legacyPlansResult.data) ? legacyPlansResult.data : [];
        const legacyPlanIds = legacyPlans.map((plan) => plan.id).filter(Boolean);
        const planToVisitMap = new Map();

        const legacyVisits = legacyPlans.map((plan) => {
          const visitId = plan.encounter_id || `legacy-${plan.id}`;
          planToVisitMap.set(String(plan.id), visitId);
          return {
            id: visitId,
            patient_id: patientId,
            visit_date: plan.created_at || null,
            notes: "Legacy visit",
            created_at: plan.created_at || null,
          };
        });

        let legacyTreatments = [];
        if (legacyPlanIds.length > 0) {
          const legacyProceduresResult = await supabase
            .from("procedures")
            .select("id, treatment_plan_id, tooth_number, tooth_id, procedure_code, procedure_name, title, status, created_at")
            .in("treatment_plan_id", legacyPlanIds)
            .order("created_at", { ascending: false });

          if (!legacyProceduresResult.error && Array.isArray(legacyProceduresResult.data)) {
            legacyTreatments = legacyProceduresResult.data.map((row) => ({
              id: row.id,
              clinic_id: clinicId,
              patient_id: patientId,
              visit_id: planToVisitMap.get(String(row.treatment_plan_id)) || null,
              tooth_number: row.tooth_number || row.tooth_id || null,
              procedure_code: row.procedure_code || null,
              procedure_name: row.procedure_name || row.title || row.procedure_code || "Procedure",
              notes: null,
              status: row.status || null,
              created_at: row.created_at || null,
            })).filter((item) => item.visit_id);
          }

          if (legacyTreatments.length === 0) {
            const legacyItemsResult = await supabase
              .from("treatment_items")
              .select("id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, procedure_description, status, created_at")
              .in("treatment_plan_id", legacyPlanIds)
              .order("created_at", { ascending: false });

            if (!legacyItemsResult.error && Array.isArray(legacyItemsResult.data)) {
              legacyTreatments = legacyItemsResult.data.map((row) => ({
                id: row.id,
                clinic_id: clinicId,
                patient_id: patientId,
                visit_id: planToVisitMap.get(String(row.treatment_plan_id)) || null,
                tooth_number: row.tooth_fdi_code || null,
                procedure_code: row.procedure_code || null,
                procedure_name: row.procedure_name || row.procedure_description || row.procedure_code || "Procedure",
                notes: null,
                status: row.status || null,
                created_at: row.created_at || null,
              })).filter((item) => item.visit_id);
            }
          }
        }

        const legacyBoard = legacyVisits.map((visit) => ({
          ...visit,
          diagnoses: [],
          treatments: legacyTreatments.filter((item) => item.visit_id === visit.id),
        }));

        return res.json({
          ok: true,
          patient,
          visits: legacyBoard,
          visit_ids: legacyVisits.map((v) => v.id),
          source: "legacy_fallback",
        });
      }
    }

    const board = visits.map((visit) => ({
      ...visit,
      diagnoses: diagnoses.filter((item) => item.visit_id === visit.id),
      treatments: treatments.filter((item) => item.visit_id === visit.id),
    }));

    res.json({ ok: true, patient, visits: board, visit_ids: visitIds });
  } catch (error) {
    console.error("[ADMIN VISIT BOARD] fatal:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/admin/patients/:patientId/visit-diagnoses", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin?.clinicId;
    const { visit_id, icd10_code, icd10_description } = req.body || {};

    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required" });
    }

    if (!patientId || !visit_id || !icd10_code) {
      return res.status(400).json({ ok: false, error: "patient_visit_icd_required" });
    }

    const { data: visit, error: visitError } = await supabase
      .from("visits")
      .select("id, patient_id")
      .eq("id", visit_id)
      .eq("patient_id", patientId)
      .single();

    if (visitError || !visit) {
      return res.status(404).json({ ok: false, error: "visit_not_found" });
    }

    const payload = {
      clinic_id: clinicId,
      patient_id: patientId,
      visit_id,
      icd10_code: String(icd10_code).trim(),
      icd10_description: icd10_description ? String(icd10_description).trim() : null,
    };

    const { data, error } = await supabase
      .from("visit_diagnoses")
      .insert(payload)
      .select("id, clinic_id, patient_id, visit_id, icd10_code, icd10_description, created_at")
      .single();

    if (error) {
      console.error("[ADMIN ADD VISIT DIAGNOSIS] error:", error);
      return res.status(500).json({ ok: false, error: "visit_diagnosis_insert_failed" });
    }

    res.json({ ok: true, diagnosis: data });
  } catch (error) {
    console.error("[ADMIN ADD VISIT DIAGNOSIS] fatal:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/admin/patients/:patientId/visit-treatments", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin?.clinicId;
    const { visit_id, tooth_number, procedure_code, procedure_name, notes, status } = req.body || {};

    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "clinic_id_required" });
    }

    if (!patientId || !visit_id || !tooth_number || !procedure_name) {
      return res.status(400).json({ ok: false, error: "patient_visit_tooth_procedure_required" });
    }

    const { data: visit, error: visitError } = await supabase
      .from("visits")
      .select("id, patient_id")
      .eq("id", visit_id)
      .eq("patient_id", patientId)
      .single();

    if (visitError || !visit) {
      return res.status(404).json({ ok: false, error: "visit_not_found" });
    }

    const payload = {
      clinic_id: clinicId,
      patient_id: patientId,
      visit_id,
      tooth_number: String(tooth_number).trim(),
      procedure_code: procedure_code ? String(procedure_code).trim() : null,
      procedure_name: String(procedure_name).trim(),
      notes: notes ? String(notes).trim() : null,
      status: status ? String(status).trim() : "PLANNED",
    };

    const { data, error } = await supabase
      .from("treatments")
      .insert(payload)
      .select("id, clinic_id, patient_id, visit_id, tooth_number, procedure_code, procedure_name, notes, status, created_at")
      .single();

    if (error) {
      console.error("[ADMIN ADD VISIT TREATMENT] error:", error);
      return res.status(500).json({ ok: false, error: "treatment_insert_failed" });
    }

    res.json({ ok: true, treatment: data });
  } catch (error) {
    console.error("[ADMIN ADD VISIT TREATMENT] fatal:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TREATMENT GROUPS LIST ================= */
// app.get("/api/admin/treatment-groups", adminAuth, async (req, res) => {
//   try {
//     // 🔥 CRITICAL: Use req.admin.clinicId instead of req.clinicId
//     const clinicId = req.admin?.clinicId;
//     const { patientId } = req.query;
// 
//     // 🔥 CRITICAL: Add undefined guard
//     if (!clinicId) {
//       console.error("[TREATMENT GROUPS LIST] Missing clinicId:", { 
//         admin: req.admin,
//         clinicId: clinicId 
//       });
//       return res.status(400).json({ 
//         ok: false, 
//         error: "Missing clinicId" 
//       });
//     }
// 
//     // 🔥 Debug log
//     console.log("[TREATMENT GROUPS LIST] clinicId:", clinicId, "patientId:", patientId);
//
//     let query = supabase
//       .from("treatment_groups")
//       .select(`
//         *,
//         patients!tg_patient_fk (*),
//         treatment_group_doctors (
//           doctor_id,
//           is_primary,
//           doctors (*)
//         )
//       `)
//       .eq("clinic_id", clinicId);
//
//     // 🔥 Add patientId filter if provided
//     if (!patientId) {
//       return res.status(400).json({
//         ok: false,
//         error: "patient_id_required"
//       });
//     }
//     
//     if (patientId) {
//       query = query.eq("patient_id", patientId);
//     }
//
//     const { data, error } = await query.order("created_at", { ascending: false });
//
//     if (error) {
//       console.error("[TREATMENT GROUPS LIST] Error:", error);
//       return res.status(500).json({ 
//         ok: false, 
//         error: "failed_to_fetch_treatment_groups",
//         details: error.message 
//       });
//     }
//
//     console.log(`[TREATMENT GROUPS LIST] Fetched ${data?.length || 0} groups for clinic ${clinicId}${patientId ? ` and patient ${patientId}` : ''}`);
//
//     res.json({
//       ok: true,
//       data: data || []
//     });
//
//   } catch (err) {
//     console.error("[TREATMENT GROUPS LIST] Fatal error:", err);
//     res.status(500).json({ 
//       ok: false, 
//       error: "internal_error" 
//     });
//   }
// });

/* ================= ADMIN ASSIGN PATIENT (TREATMENT GROUP) ================= */
app.post("/api/admin/treatment-groups/:groupId/add-doctor", adminAuth, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { doctorId } = req.body || {};
    const { clinicId } = req.admin;

    if (!groupId || !doctorId) {
      return res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
    }

    // Validate group belongs to same clinic
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id, clinic_id, status")
      .eq("id", groupId)
      .eq("clinic_id", clinicId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({
        ok: false,
        error: "group_not_found"
      });
    }

    // Validate doctor belongs to same clinic
    const { data: doctor, error: doctorError } = await supabase
      .from("doctors")
      .select("id, clinic_id, status")
      .eq("id", doctorId)
      .eq("clinic_id", clinicId)
      .eq("status", "APPROVED")
      .single();

    if (doctorError || !doctor) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_found_or_not_approved"
      });
    }

    // Check if doctor already in group
    const { data: existingMember, error: memberError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", groupId)
      .eq("doctor_id", doctorId)
      .single();

    if (existingMember) {
      return res.status(400).json({
        ok: false,
        error: "doctor_already_in_group"
      });
    }

    // Add doctor to group
    const { data: newMember, error: addError } = await supabase
      .from("treatment_group_members")
      .insert({
        treatment_group_id: groupId,
        doctor_id: doctorId,
        role: "MEMBER",
        status: "ACTIVE",
        joined_at: new Date().toISOString()
      })
      .select()
      .single();

    if (addError || !newMember) {
      return res.status(500).json({
        ok: false,
        error: "failed_to_add_doctor_to_group"
      });
    }

    res.json({
      ok: true,
      message: "Doctor added to treatment group successfully",
      member: newMember
    });

  } catch (error) {
    console.error("[ADD DOCTOR TO TREATMENT GROUP] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= REMOVE DOCTOR FROM TREATMENT GROUP ================= */
app.delete("/api/admin/treatment-groups/:groupId/remove-doctor", adminAuth, async (req, res) => {
try {
const { groupId } = req.params;
const { doctorId } = req.body || {};
const { clinicId } = req.admin;

    if (!groupId || !doctorId) {
      return res.status(400).json({
        ok: false,
        error: "missing_required_fields"
      });
    }

    // Validate group belongs to same clinic
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("id, clinic_id, status")
      .eq("id", groupId)
      .eq("clinic_id", clinicId)
      .single();

    if (groupError || !group) {
      return res.status(404).json({
        ok: false,
        error: "group_not_found"
      });
    }

    // Check if doctor is in group
    const { data: existingMember, error: memberError } = await supabase
      .from("treatment_group_members")
      .select("id, role")
      .eq("treatment_group_id", groupId)
      .eq("doctor_id", doctorId)
      .single();

    if (memberError || !existingMember) {
      return res.status(404).json({
        ok: false,
        error: "doctor_not_in_group"
      });
    }

    // Check if removing primary doctor from ACTIVE group
    if (existingMember.role === "PRIMARY" && group.status === "ACTIVE") {
      return res.status(400).json({
        ok: false,
        error: "cannot_remove_primary_doctor_from_active_group"
      });
    }

    // Count remaining doctors in group
    const { data: remainingMembers, error: countError } = await supabase
      .from("treatment_group_members")
      .select("id")
      .eq("treatment_group_id", groupId);

    if (countError) {
      return res.status(500).json({
        ok: false,
        error: "failed_to_count_remaining_doctors"
      });
    }

    // If removing last doctor, close the group
    if (remainingMembers.length <= 1) {
      await supabase
        .from("treatment_groups")
        .update({ 
          status: "COMPLETED",
          closed_at: new Date().toISOString()
        })
        .eq("id", groupId);
    }

    // Remove doctor from group
    const { error: removeError } = await supabase
      .from("treatment_group_members")
      .delete()
      .eq("treatment_group_id", groupId)
      .eq("doctor_id", doctorId);

    if (removeError) {
      return res.status(500).json({
        ok: false,
        error: "failed_to_remove_doctor_from_group"
      });
    }

    res.json({
      ok: true,
      message: "Doctor removed from treatment group successfully"
    });

  } catch (error) {
    console.error("[REMOVE DOCTOR FROM GROUP] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR ENCOUNTERS ================= */

const DOCTOR_ENCOUNTER_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isEncounterDoctorUuid(value) {
  return DOCTOR_ENCOUNTER_UUID_REGEX.test(String(value || "").trim());
}

async function resolveEncounterDoctorOwnerCandidates(decoded) {
  const { doctorId, clinicId, clinicCode, email } = decoded || {};
  const doctorOwnerCandidates = [...new Set([String(doctorId || "").trim()].filter(Boolean))];

  try {
    const selectCandidates = [
      "id, doctor_id, clinic_id, clinic_code, email",
      "id, doctor_id, clinic_code, email",
      "id, doctor_id, email",
    ];

    let resolvedDoctor = null;
    for (const selectClause of selectCandidates) {
      const byDoctorId = await supabase
        .from("doctors")
        .select(selectClause)
        .eq("doctor_id", String(doctorId || "").trim())
        .limit(1)
        .maybeSingle();

      if (!byDoctorId.error && byDoctorId.data) {
        resolvedDoctor = byDoctorId.data;
        break;
      }

      const byId = await supabase
        .from("doctors")
        .select(selectClause)
        .eq("id", String(doctorId || "").trim())
        .limit(1)
        .maybeSingle();

      if (!byId.error && byId.data) {
        resolvedDoctor = byId.data;
        break;
      }

      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedClinicCode = String(clinicCode || "").trim().toUpperCase();
      if (normalizedEmail && normalizedClinicCode) {
        const byEmailClinic = await supabase
          .from("doctors")
          .select(selectClause)
          .eq("email", normalizedEmail)
          .eq("clinic_code", normalizedClinicCode)
          .limit(1)
          .maybeSingle();

        if (!byEmailClinic.error && byEmailClinic.data) {
          resolvedDoctor = byEmailClinic.data;
          break;
        }
      }
    }

    if (resolvedDoctor) {
      if (!clinicId || !resolvedDoctor.clinic_id || String(resolvedDoctor.clinic_id) === String(clinicId)) {
        doctorOwnerCandidates.unshift(String(resolvedDoctor.id || "").trim());
        doctorOwnerCandidates.push(String(resolvedDoctor.doctor_id || "").trim());
      }
    }
  } catch (doctorResolveError) {
    console.warn("[ENCOUNTERS] doctor resolver warning:", doctorResolveError?.message || doctorResolveError);
  }

  const normalizedDoctorCandidates = [...new Set(doctorOwnerCandidates.filter(Boolean))];
  if (normalizedDoctorCandidates.some(isEncounterDoctorUuid)) {
    return normalizedDoctorCandidates.filter(isEncounterDoctorUuid);
  }
  return normalizedDoctorCandidates;
}

async function collectDoctorEncounterAccess(decoded, options = {}) {
  const doctorOwnerKeys = await resolveEncounterDoctorOwnerCandidates(decoded || {});
  const doctorKeys = [...new Set(doctorOwnerKeys.map((v) => String(v || "").trim()).filter(Boolean))];
  const patientIdsFilter = Array.isArray(options.patientIds)
    ? [...new Set(options.patientIds.map((v) => String(v || "").trim()).filter(Boolean))]
    : [];

  const encounterMap = new Map();
  const assignmentEncounterIds = new Set();

  for (const ownerDoctorId of doctorKeys) {
    let baseQuery = supabase
      .from("patient_encounters")
      .select("id, patient_id, created_by_doctor_id, treatment_group_id, status, created_at")
      .eq("created_by_doctor_id", ownerDoctorId);

    if (patientIdsFilter.length > 0) {
      baseQuery = baseQuery.in("patient_id", patientIdsFilter);
    }

    const result = await baseQuery.order("created_at", { ascending: false });
    if (!result.error && Array.isArray(result.data)) {
      for (const row of result.data) {
        const encounterId = String(row?.id || "").trim();
        if (!encounterId) continue;
        encounterMap.set(encounterId, row);
      }
      continue;
    }

    if (String(result.error?.code || "") !== "22P02") {
      console.warn("[ACCESS] primary encounter fetch warning:", result.error);
    }
  }

  const assignmentSources = [
    { table: "treatment_doctors", encounterColumn: "encounter_id", doctorColumn: "doctor_id" },
    { table: "treatment_doctors", encounterColumn: "encounterId", doctorColumn: "doctorId" },
    { table: "encounter_doctors", encounterColumn: "encounter_id", doctorColumn: "doctor_id" },
    { table: "encounter_doctors", encounterColumn: "encounterId", doctorColumn: "doctorId" },
  ];

  for (const source of assignmentSources) {
    let sourceUnavailable = false;

    for (const ownerDoctorId of doctorKeys) {
      const result = await supabase
        .from(source.table)
        .select(source.encounterColumn)
        .eq(source.doctorColumn, ownerDoctorId)
        .limit(500);

      if (!result.error && Array.isArray(result.data)) {
        for (const row of result.data) {
          const encounterId = String(row?.[source.encounterColumn] || "").trim();
          if (encounterId) assignmentEncounterIds.add(encounterId);
        }
        continue;
      }

      const code = String(result.error?.code || "");
      if (["PGRST205", "PGRST204", "42P01", "42703"].includes(code)) {
        sourceUnavailable = true;
        break;
      }
      if (code !== "22P02") {
        console.warn("[ACCESS] assignment source warning:", source.table, result.error);
      }
    }

    if (!sourceUnavailable && assignmentEncounterIds.size > 0) {
      break;
    }
  }

  for (const ownerDoctorId of doctorKeys) {
    const plansResult = await supabase
      .from("treatment_plans")
      .select("encounter_id")
      .eq("assigned_doctor_id", ownerDoctorId)
      .limit(500);

    if (!plansResult.error && Array.isArray(plansResult.data)) {
      for (const row of plansResult.data) {
        const encounterId = String(row?.encounter_id || "").trim();
        if (encounterId) assignmentEncounterIds.add(encounterId);
      }
      continue;
    }

    const code = String(plansResult.error?.code || "");
    if (!["22P02", "42703", "PGRST204", "PGRST205"].includes(code)) {
      console.warn("[ACCESS] treatment_plans assignment warning:", plansResult.error);
    }
  }

  if (assignmentEncounterIds.size > 0) {
    const ids = Array.from(assignmentEncounterIds);
    const chunkSize = 150;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      let query = supabase
        .from("patient_encounters")
        .select("id, patient_id, created_by_doctor_id, treatment_group_id, status, created_at")
        .in("id", chunk);

      if (patientIdsFilter.length > 0) {
        query = query.in("patient_id", patientIdsFilter);
      }

      const result = await query;
      if (!result.error && Array.isArray(result.data)) {
        for (const row of result.data) {
          const encounterId = String(row?.id || "").trim();
          if (!encounterId) continue;
          encounterMap.set(encounterId, row);
        }
      }
    }
  }

  return {
    doctorKeys,
    encounterIds: Array.from(encounterMap.keys()),
    encounters: Array.from(encounterMap.values()),
  };
}

async function doctorHasAccessToEncounter(encounterId, decoded) {
  const normalizedEncounterId = String(encounterId || "").trim();
  if (!normalizedEncounterId) return false;

  const access = await collectDoctorEncounterAccess(decoded || {});
  return access.encounterIds.includes(normalizedEncounterId);
}

async function doctorHasAccessToPatient(patientId, decoded) {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) return false;

  const access = await collectDoctorEncounterAccess(decoded || {}, { patientIds: [normalizedPatientId] });
  if (access.encounters.some((enc) => String(enc?.patient_id || "").trim() === normalizedPatientId)) {
    return true;
  }

  const patientLookup = await supabase
    .from("patients")
    .select("id, patient_id")
    .or(`id.eq.${normalizedPatientId},patient_id.eq.${normalizedPatientId}`)
    .limit(1)
    .maybeSingle();

  if (patientLookup.error || !patientLookup.data) {
    return false;
  }

  const aliases = [String(patientLookup.data.id || "").trim(), String(patientLookup.data.patient_id || "").trim()].filter(Boolean);
  if (aliases.length === 0) return false;

  const aliasAccess = await collectDoctorEncounterAccess(decoded || {}, { patientIds: aliases });
  return aliasAccess.encounters.length > 0;
}

async function doctorHasAccessToAppointment(appointmentId, decoded) {
  const normalizedAppointmentId = String(appointmentId || "").trim();
  if (!normalizedAppointmentId) return false;

  const doctorKeys = await resolveEncounterDoctorOwnerCandidates(decoded || {});

  for (const ownerDoctorId of doctorKeys) {
    const primaryResult = await supabase
      .from("appointments")
      .select("id")
      .eq("id", normalizedAppointmentId)
      .eq("doctor_id", ownerDoctorId)
      .limit(1)
      .maybeSingle();

    if (!primaryResult.error && primaryResult.data) {
      return true;
    }

    const code = String(primaryResult.error?.code || "");
    if (!["22P02", "PGRST116"].includes(code) && primaryResult.error) {
      console.warn("[ACCESS] appointment primary lookup warning:", primaryResult.error);
    }
  }

  const assignmentSources = [
    { table: "appointment_doctors", appointmentColumn: "appointment_id", doctorColumn: "doctor_id" },
    { table: "appointment_doctors", appointmentColumn: "appointmentId", doctorColumn: "doctorId" },
  ];

  for (const source of assignmentSources) {
    for (const ownerDoctorId of doctorKeys) {
      const assignmentResult = await supabase
        .from(source.table)
        .select(source.appointmentColumn)
        .eq(source.appointmentColumn, normalizedAppointmentId)
        .eq(source.doctorColumn, ownerDoctorId)
        .limit(1)
        .maybeSingle();

      if (!assignmentResult.error && assignmentResult.data) {
        return true;
      }

      const code = String(assignmentResult.error?.code || "");
      if (["PGRST205", "PGRST204", "42P01", "42703"].includes(code)) {
        break;
      }
      if (!["22P02", "PGRST116"].includes(code) && assignmentResult.error) {
        console.warn("[ACCESS] appointment assignment lookup warning:", assignmentResult.error);
      }
    }
  }

  return false;
}

const ENCOUNTER_NOTE_EDIT_WINDOW_MS = 5 * 60 * 1000;
const ENCOUNTER_NOTE_EVENT_TYPE = "encounter_note";
const ENCOUNTER_NOTE_FALLBACK_KIND = "encounter_note";
const ENCOUNTER_NOTE_FALLBACK_SOURCE = "events_fallback";

function isMissingRelationError(error) {
  const code = String(error?.code || "");
  return ["PGRST205", "PGRST204", "42P01", "42703"].includes(code);
}

function mapEventRowToEncounterNote(eventRow) {
  const data = eventRow?.data || {};
  return {
    id: String(data?.note_id || eventRow?.id || "").trim(),
    encounter_id: String(data?.encounter_id || "").trim(),
    doctor_id: String(data?.doctor_id || "").trim(),
    content: String(data?.content || "").trim(),
    is_edited: !!data?.is_edited,
    edited_at: data?.edited_at || null,
    edited_by: data?.edited_by || null,
    is_correction: !!data?.is_correction,
    correction_for: data?.correction_for || null,
    author_role: String(data?.author_role || "DOCTOR").toUpperCase(),
    created_at: data?.created_at || eventRow?.created_at || null,
    _storage_source: ENCOUNTER_NOTE_FALLBACK_SOURCE,
    _event_id: eventRow?.id || null,
  };
}

async function resolveEncounterContext(encounterId) {
  const encounterResult = await supabase
    .from("patient_encounters")
    .select("id,patient_id")
    .eq("id", String(encounterId || "").trim())
    .maybeSingle();

  if (encounterResult.error || !encounterResult.data) {
    return { data: null, error: encounterResult.error || new Error("encounter_not_found") };
  }

  const patientId = encounterResult.data?.patient_id || null;
  let clinicId = null;
  if (patientId) {
    const patientResult = await supabase
      .from("patients")
      .select("id,clinic_id")
      .eq("id", patientId)
      .maybeSingle();

    if (!patientResult.error && patientResult.data) {
      clinicId = patientResult.data.clinic_id || null;
    }
  }

  return {
    data: {
      encounter_id: String(encounterResult.data.id || "").trim(),
      patient_id: patientId,
      clinic_id: clinicId,
    },
    error: null,
  };
}

async function fetchEncounterNoteByIdFromEvents(noteId) {
  const normalizedNoteId = String(noteId || "").trim();
  if (!normalizedNoteId) return { data: null, error: null };

  let result = await supabase
    .from("events")
    .select("id,created_at,data")
    .eq("event_type", ENCOUNTER_NOTE_EVENT_TYPE)
    .contains("data", { kind: ENCOUNTER_NOTE_FALLBACK_KIND, note_id: normalizedNoteId })
    .order("created_at", { ascending: false })
    .limit(1);

  if (result.error) {
    const fallbackResult = await supabase
      .from("events")
      .select("id,created_at,data")
      .eq("event_type", ENCOUNTER_NOTE_EVENT_TYPE)
      .order("created_at", { ascending: false })
      .limit(500);

    if (fallbackResult.error) {
      return { data: null, error: fallbackResult.error };
    }

    const matched = (fallbackResult.data || []).find((row) => {
      const data = row?.data || {};
      return data?.kind === ENCOUNTER_NOTE_FALLBACK_KIND && String(data?.note_id || "").trim() === normalizedNoteId;
    });

    return { data: matched ? mapEventRowToEncounterNote(matched) : null, error: null };
  }

  const first = (result.data || [])[0] || null;
  return { data: first ? mapEventRowToEncounterNote(first) : null, error: null };
}

async function listEncounterNotesFromEvents(encounterId) {
  const normalizedEncounterId = String(encounterId || "").trim();
  if (!normalizedEncounterId) return { data: [], error: null };

  let result = await supabase
    .from("events")
    .select("id,created_at,data")
    .eq("event_type", ENCOUNTER_NOTE_EVENT_TYPE)
    .contains("data", { kind: ENCOUNTER_NOTE_FALLBACK_KIND, encounter_id: normalizedEncounterId })
    .order("created_at", { ascending: true });

  if (result.error) {
    const fallbackResult = await supabase
      .from("events")
      .select("id,created_at,data")
      .eq("event_type", ENCOUNTER_NOTE_EVENT_TYPE)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (fallbackResult.error) {
      return { data: null, error: fallbackResult.error };
    }

    result = {
      data: (fallbackResult.data || []).filter((row) => {
        const data = row?.data || {};
        return data?.kind === ENCOUNTER_NOTE_FALLBACK_KIND && String(data?.encounter_id || "").trim() === normalizedEncounterId;
      }),
      error: null,
    };
  }

  return {
    data: (result.data || []).map((row) => mapEventRowToEncounterNote(row)),
    error: null,
  };
}

async function createEncounterNoteFromEvents({ encounterId, doctorId, content, isCorrection, correctionFor, authorRole }) {
  const contextResult = await resolveEncounterContext(encounterId);
  if (contextResult.error || !contextResult.data) {
    return { data: null, error: contextResult.error || new Error("encounter_not_found") };
  }

  const nowIso = new Date().toISOString();
  const noteId = randomUUID();
  const noteData = {
    kind: ENCOUNTER_NOTE_FALLBACK_KIND,
    note_id: noteId,
    encounter_id: contextResult.data.encounter_id,
    doctor_id: String(doctorId || "").trim(),
    content: String(content || "").trim(),
    is_edited: false,
    edited_at: null,
    edited_by: null,
    is_correction: !!isCorrection,
    correction_for: correctionFor || null,
    author_role: String(authorRole || "DOCTOR").toUpperCase(),
    created_at: nowIso,
  };

  const eventInsert = await supabase
    .from("events")
    .insert({
      clinic_id: contextResult.data.clinic_id || null,
      patient_id: contextResult.data.patient_id || null,
      event_type: ENCOUNTER_NOTE_EVENT_TYPE,
      data: noteData,
    })
    .select("id,created_at,data")
    .single();

  if (eventInsert.error || !eventInsert.data) {
    return { data: null, error: eventInsert.error || new Error("fallback_note_create_failed") };
  }

  return { data: mapEventRowToEncounterNote(eventInsert.data), error: null };
}

async function updateEncounterNoteFromEvents(noteId, patch) {
  const existingResult = await fetchEncounterNoteByIdFromEvents(noteId);
  if (existingResult.error || !existingResult.data) {
    return { data: null, error: existingResult.error || null };
  }

  const existing = existingResult.data;
  const existingEventId = existing?._event_id;
  if (!existingEventId) {
    return { data: null, error: new Error("fallback_event_missing") };
  }

  const mergedData = {
    kind: ENCOUNTER_NOTE_FALLBACK_KIND,
    note_id: String(existing.id || noteId || "").trim(),
    encounter_id: String(existing.encounter_id || "").trim(),
    doctor_id: String(existing.doctor_id || "").trim(),
    content: String(patch?.content ?? existing.content ?? "").trim(),
    is_edited: patch?.is_edited ?? existing.is_edited,
    edited_at: patch?.edited_at ?? existing.edited_at,
    edited_by: patch?.edited_by ?? existing.edited_by,
    is_correction: patch?.is_correction ?? existing.is_correction,
    correction_for: patch?.correction_for ?? existing.correction_for,
    author_role: String(patch?.author_role ?? existing.author_role ?? "DOCTOR").toUpperCase(),
    created_at: existing.created_at || new Date().toISOString(),
  };

  const updateResult = await supabase
    .from("events")
    .update({ data: mergedData })
    .eq("id", existingEventId)
    .select("id,created_at,data")
    .single();

  if (updateResult.error || !updateResult.data) {
    return { data: null, error: updateResult.error || new Error("fallback_note_update_failed") };
  }

  return { data: mapEventRowToEncounterNote(updateResult.data), error: null };
}

async function fetchEncounterNoteById(noteId) {
  const selectCandidates = [
    "id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,author_role,created_at",
    "id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,created_at",
    "id,encounter_id,doctor_id,content,is_correction,correction_for,created_at",
  ];

  let lastError = null;
  for (const selectClause of selectCandidates) {
    const result = await supabase
      .from("encounter_notes")
      .select(selectClause)
      .eq("id", String(noteId || "").trim())
      .maybeSingle();

    if (!result.error) return result;
    lastError = result.error;
    if (!isMissingRelationError(result.error)) break;
  }

  if (isMissingRelationError(lastError)) {
    return fetchEncounterNoteByIdFromEvents(noteId);
  }

  return { data: null, error: lastError };
}

async function listEncounterNotes(encounterId) {
  const selectCandidates = [
    "id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,author_role,created_at",
    "id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,created_at",
    "id,encounter_id,doctor_id,content,is_correction,correction_for,created_at",
  ];

  let lastError = null;
  for (const selectClause of selectCandidates) {
    const result = await supabase
      .from("encounter_notes")
      .select(selectClause)
      .eq("encounter_id", String(encounterId || "").trim())
      .order("created_at", { ascending: true });

    if (!result.error) return result;
    lastError = result.error;
    if (!isMissingRelationError(result.error)) break;
  }

  if (isMissingRelationError(lastError)) {
    return listEncounterNotesFromEvents(encounterId);
  }

  return { data: null, error: lastError };
}

function normalizeEncounterNote(row, actorDoctorKeys = []) {
  const createdAt = String(row?.created_at || "").trim();
  const createdTs = createdAt ? Date.parse(createdAt) : NaN;
  const ageMs = Number.isFinite(createdTs) ? Math.max(0, Date.now() - createdTs) : Number.POSITIVE_INFINITY;
  const noteDoctorId = String(row?.doctor_id || "").trim();
  const canEdit = actorDoctorKeys.includes(noteDoctorId) && ageMs <= ENCOUNTER_NOTE_EDIT_WINDOW_MS;
  const storageSource = String(row?._storage_source || "encounter_notes").trim() || "encounter_notes";

  return {
    id: row?.id,
    encounter_id: row?.encounter_id,
    doctor_id: noteDoctorId,
    content: row?.content || "",
    is_edited: !!row?.is_edited,
    edited_at: row?.edited_at || null,
    edited_by: row?.edited_by || null,
    is_correction: !!row?.is_correction,
    correction_for: row?.correction_for || null,
    author_role: String(row?.author_role || "DOCTOR").toUpperCase(),
    created_at: row?.created_at || null,
    storage_source: storageSource,
    can_edit: canEdit,
    edit_window_seconds_remaining: canEdit
      ? Math.max(0, Math.floor((ENCOUNTER_NOTE_EDIT_WINDOW_MS - ageMs) / 1000))
      : 0,
  };
}

async function logEncounterNoteAudit({
  action,
  noteId,
  encounterId,
  actorId,
  actorRole,
  metadata,
}) {
  const payload = {
    note_id: String(noteId || "").trim() || null,
    encounter_id: String(encounterId || "").trim() || null,
    action: String(action || "UNKNOWN").trim().toUpperCase(),
    actor_id: String(actorId || "").trim() || null,
    actor_role: String(actorRole || "DOCTOR").trim().toUpperCase(),
    metadata: metadata || null,
    created_at: new Date().toISOString(),
  };

  const attempt = await supabase.from("encounter_note_audit_logs").insert(payload);
  if (!attempt.error) return;

  if (isMissingRelationError(attempt.error)) {
    console.warn("[ENCOUNTER NOTES AUDIT] audit table missing, skipping persistent log");
    return;
  }

  console.warn("[ENCOUNTER NOTES AUDIT] insert warning:", attempt.error);
}

// POST /api/doctor/encounters - Create new encounter
app.post("/api/doctor/encounters", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId, clinicId } = v.decoded;
    const { patient_id, notes, force_new } = req.body || {};
    const forceCreateNewEncounter =
      force_new === true ||
      force_new === 1 ||
      String(force_new || "").toLowerCase() === "true" ||
      String(force_new || "") === "1";

    // Validation
    if (!patient_id) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const isUuid = (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(value || "").trim()
      );

    const doctorOwnerCandidates = [...new Set([String(doctorId || "").trim()].filter(Boolean))];

    try {
      const selectCandidates = [
        "id, doctor_id, clinic_id, clinic_code, email",
        "id, doctor_id, clinic_code, email",
        "id, doctor_id, email",
      ];

      let resolvedDoctor = null;
      for (const selectClause of selectCandidates) {
        const byDoctorId = await supabase
          .from("doctors")
          .select(selectClause)
          .eq("doctor_id", String(doctorId || "").trim())
          .limit(1)
          .maybeSingle();

        if (!byDoctorId.error && byDoctorId.data) {
          resolvedDoctor = byDoctorId.data;
          break;
        }

        const byId = await supabase
          .from("doctors")
          .select(selectClause)
          .eq("id", String(doctorId || "").trim())
          .limit(1)
          .maybeSingle();

        if (!byId.error && byId.data) {
          resolvedDoctor = byId.data;
          break;
        }

        const normalizedEmail = String(email || "").trim().toLowerCase();
        const normalizedClinicCode = String(clinicCode || "").trim().toUpperCase();
        if (normalizedEmail && normalizedClinicCode) {
          const byEmailClinic = await supabase
            .from("doctors")
            .select(selectClause)
            .eq("email", normalizedEmail)
            .eq("clinic_code", normalizedClinicCode)
            .limit(1)
            .maybeSingle();

          if (!byEmailClinic.error && byEmailClinic.data) {
            resolvedDoctor = byEmailClinic.data;
            break;
          }
        }
      }

      if (resolvedDoctor) {
        if (!clinicId || !resolvedDoctor.clinic_id || String(resolvedDoctor.clinic_id) === String(clinicId)) {
          doctorOwnerCandidates.unshift(String(resolvedDoctor.id || "").trim());
          doctorOwnerCandidates.push(String(resolvedDoctor.doctor_id || "").trim());
        }
      }
    } catch (doctorResolveError) {
      console.warn("[ENCOUNTERS] doctor resolver warning:", doctorResolveError?.message || doctorResolveError);
    }

    const normalizedDoctorCandidates = [...new Set(doctorOwnerCandidates.filter(Boolean))];
    const uuidDoctorCandidates = normalizedDoctorCandidates.filter(isUuid);
    const ownershipCandidates = uuidDoctorCandidates.length > 0 ? uuidDoctorCandidates : normalizedDoctorCandidates;

    // Rule: Aynı hastada aktif encounter var mı?
    if (!forceCreateNewEncounter) {
      for (const doctorOwnerId of ownershipCandidates) {
        const existingResult = await supabase
          .from("patient_encounters")
          .select("id, patient_id, created_by_doctor_id, status, created_at")
          .eq("patient_id", patient_id)
          .in("status", ["ACTIVE", "active"])
          .eq("created_by_doctor_id", doctorOwnerId)
          .maybeSingle();

        const existingErrorCode = String(existingResult?.error?.code || "");
        if (existingResult?.error && existingErrorCode === "22P02") {
          continue;
        }

        if (existingResult?.data) {
          return res.json({
            ok: true,
            alreadyExists: true,
            encounter: existingResult.data,
          });
        }

        if (existingResult?.error) {
          console.warn("[ENCOUNTERS] existing encounter check warning:", existingResult.error);
        }
        break;
      }
    }

    let encounter = null;
    let encounterError = null;

    for (const doctorOwnerId of ownershipCandidates) {
      const basePayload = {
        patient_id: patient_id,
        created_by_doctor_id: doctorOwnerId,
        encounter_type: "initial",
        status: "active",
        created_at: new Date().toISOString(),
      };

      const payloadWithOptionalFields = {
        ...basePayload,
        notes: notes || "Initial examination",
      };

      const insertWithAllFields = await supabase
        .from("patient_encounters")
        .insert(payloadWithOptionalFields)
        .select("id, patient_id, created_by_doctor_id, status, created_at")
        .single();

      encounter = insertWithAllFields.data;
      encounterError = insertWithAllFields.error;

      if (encounterError && String(encounterError.code || "") === "PGRST204") {
        const insertWithCoreFields = await supabase
          .from("patient_encounters")
          .insert(basePayload)
          .select("id, patient_id, created_by_doctor_id, status, created_at")
          .single();
        encounter = insertWithCoreFields.data;
        encounterError = insertWithCoreFields.error;
      }

      const errorCode = String(encounterError?.code || "");
      if (!encounterError) {
        break;
      }
      if (errorCode === "22P02") {
        continue;
      }
      break;
    }

    encounter = insertWithAllFields.data;
    encounterError = insertWithAllFields.error;

    if (encounterError && String(encounterError.code || "") === "PGRST204") {
      const insertWithCoreFields = await supabase
        .from("patient_encounters")
        .insert(basePayload)
        .select("id, patient_id, created_by_doctor_id, status, created_at")
        .single();
      encounter = insertWithCoreFields.data;
      encounterError = insertWithCoreFields.error;
    }

    if (encounterError) {
      console.error("[ENCOUNTERS] Error creating encounter:", encounterError);
      return res.status(500).json({ ok: false, error: "encounter_creation_failed" });
    }

    res.json({
      ok: true,
      encounter: encounter
    });

  } catch (err) {
    console.error("[ENCOUNTERS] Exception:", err.message);
    console.error("[ENCOUNTERS] Stack trace:", err.stack);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/doctor/encounters - Get doctor's active encounters
app.get("/api/doctor/encounters", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const access = await collectDoctorEncounterAccess(v.decoded);
    const encounterIds = access.encounterIds;
    if (encounterIds.length === 0) {
      return res.json({ ok: true, encounters: [] });
    }

    const { data: encounters, error } = await supabase
      .from("patient_encounters")
      .select(`
        *,
        patients!inner(
          id,
          name,
          phone,
          email
        )
      `)
      .in("id", encounterIds)
      .in("status", ["ACTIVE", "active"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ENCOUNTERS] Error fetching encounters:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    // Format for dashboard
    const formattedEncounters = encounters.map(encounter => ({
      id: encounter.id,
      patient_id: encounter.patient_id,
      patient_name: encounter.patients.name,
      patient_phone: encounter.patients.phone,
      patient_email: encounter.patients.email,
      status: encounter.status,
      created_at: encounter.created_at,
      notes: encounter.notes,
      // Dashboard için "Tedaviye Devam Et" butonu
      action_button: {
        text: "Tedaviye Devam Et",
        target: `/treatment/${encounter.patient_id}`
      }
    }));

    res.json({
      ok: true,
      encounters: formattedEncounters
    });

  } catch (err) {
    console.error("[ENCOUNTERS] Get exception:", err.message);
    console.error("[ENCOUNTERS] Stack trace:", err.stack);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/doctor/encounters/patient/:patientId - Get encounters for specific patient
app.get("/api/doctor/encounters/patient/:patientId", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      console.error("[ENCOUNTERS BY PATIENT] Auth failed:", v.code);
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { doctorId } = v.decoded;
    const { patientId } = req.params;
    const hasPatientAccess = await doctorHasAccessToPatient(patientId, v.decoded);
    if (!hasPatientAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    // Enhanced logging
    console.log("[ENCOUNTERS BY PATIENT] Request:", {
      doctorId,
      patientId,
      user: req.user,
      params: req.params
    });

    // Input validation
    if (!patientId) {
      console.error("[ENCOUNTERS BY PATIENT] Missing patientId");
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    // Rule: Doctor sadece kendi hastalarının encounter'larını görebilir
    const access = await collectDoctorEncounterAccess(v.decoded, { patientIds: [patientId] });
    const encounterIds = access.encounterIds;

    if (encounterIds.length === 0) {
      return res.json({ ok: true, encounters: [] });
    }

    const { data: encounters, error } = await supabase
      .from("patient_encounters")
      .select(`
        *,
        patients!inner(
          id,
          name,
          phone,
          email
        )
      `)
      .in("id", encounterIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ENCOUNTERS BY PATIENT] Database error:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Enhanced logging for successful query
    console.log("[ENCOUNTERS BY PATIENT] Query result:", {
      found: encounters ? encounters.length : 0,
      patientId,
      doctorId
    });

    // Return 200 with empty array instead of 500 for no encounters
    return res.json({
      ok: true,
      encounters: encounters || []
    });

  } catch (err) {
    console.error("[ENCOUNTERS BY PATIENT] Exception:", err.message);
    console.error("[ENCOUNTERS BY PATIENT] Stack trace:", err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

async function resolveDoctorEncounterAccess(doctorId, encounterId) {
  const selectCandidates = [
    "id, created_by_doctor_id, assigned_doctor_id, doctor_id, patient_id, status",
    "id, created_by_doctor_id, assigned_doctor_id, patient_id, status",
    "id, created_by_doctor_id, patient_id, status",
    "id, patient_id, status",
  ];

  let encounter = null;
  let lastError = null;

  for (const selectClause of selectCandidates) {
    const attempt = await supabase
      .from("patient_encounters")
      .select(selectClause)
      .eq("id", encounterId)
      .limit(1)
      .maybeSingle();

    if (!attempt.error && attempt.data) {
      encounter = attempt.data;
      lastError = null;
      break;
    }

    lastError = attempt.error;
    if (!attempt.error) {
      break;
    }

    if (!["42703", "PGRST204"].includes(String(attempt.error?.code || ""))) {
      break;
    }
  }

  if (!encounter) {
    return { ok: false, error: "encounter_not_found", details: lastError };
  }

  const ownerIds = [
    encounter.created_by_doctor_id,
    encounter.assigned_doctor_id,
    encounter.doctor_id,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);

  if (ownerIds.length === 0 || ownerIds.includes(String(doctorId))) {
    return { ok: true, encounter };
  }

  return { ok: false, error: "not_assigned_doctor", encounter };
}

// GET /api/doctor/encounters/:id/diagnoses - Get diagnoses for specific encounter
app.get("/api/doctor/encounters/:id/diagnoses", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      console.error("[ENCOUNTER DIAGNOSES] Auth failed:", v.code);
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { doctorId } = v.decoded;
    const { id: encounterId } = req.params;
    const hasAccess = await doctorHasAccessToEncounter(encounterId, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    // Enhanced logging
    console.log("[ENCOUNTER DIAGNOSES] Request:", {
      doctorId,
      encounterId,
      user: req.user,
      params: req.params
    });

    // Input validation
    if (!encounterId) {
      console.error("[ENCOUNTER DIAGNOSES] Missing encounterId");
      return res.status(400).json({ ok: false, error: "encounterId_required" });
    }

    const encounterAccess = await resolveDoctorEncounterAccess(doctorId, encounterId);
    if (!encounterAccess.ok) {
      if (encounterAccess.error === "encounter_not_found") {
        return res.status(404).json({ ok: false, error: "encounter_not_found" });
      }
      return res.status(403).json({ ok: false, error: "not_assigned_doctor" });
    }

    const { data: diagnoses, error } = await supabase
      .from("encounter_diagnoses")
      .select(`
        *,
        patient_encounters!inner(
          id,
          created_by_doctor_id,
          patient_id,
          status
        )
      `)
      .eq("encounter_id", encounterId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ENCOUNTER DIAGNOSES] Database error:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Enhanced logging for successful query
    console.log("[ENCOUNTER DIAGNOSES] Query result:", {
      found: diagnoses ? diagnoses.length : 0,
      encounterId,
      doctorId
    });

    // Return 200 with empty array instead of 500 for no diagnoses
    return res.json({
      ok: true,
      diagnoses: diagnoses || []
    });

  } catch (err) {
    console.error("[ENCOUNTER DIAGNOSES] Exception:", err.message);
    console.error("[ENCOUNTER DIAGNOSES] Stack trace:", err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/doctor/encounters/:id/diagnoses - Add diagnoses to specific encounter (ATOMIC)
app.post("/api/doctor/encounters/:id/diagnoses", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      console.error("[ENCOUNTER DIAGNOSES POST] Auth failed:", v.code);
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { doctorId } = v.decoded;
    const { id: encounterId } = req.params;
    const { diagnoses } = req.body || {};
    const hasAccess = await doctorHasAccessToEncounter(encounterId, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    // Enhanced logging
    console.log("[ENCOUNTER DIAGNOSES POST] Request:", {
      doctorId,
      encounterId,
      diagnoses,
      user: req.user,
      params: req.params
    });

    // Input validation
    if (!encounterId) {
      console.error("[ENCOUNTER DIAGNOSES POST] Missing encounterId");
      return res.status(400).json({ ok: false, error: "encounterId_required" });
    }

    if (!diagnoses || !Array.isArray(diagnoses) || diagnoses.length === 0) {
      console.error("[ENCOUNTER DIAGNOSES POST] Missing or invalid diagnoses");
      return res.status(400).json({ ok: false, error: "diagnoses_required" });
    }

    const { data: encounter, error: encounterError } = await supabase
      .from("patient_encounters")
      .select("id, created_by_doctor_id")
      .eq("id", encounterId)
      .maybeSingle();

    if (encounterError || !encounter) {
      return res.status(404).json({ ok: false, error: "encounter_not_found" });
    }

    const normalizedDiagnoses = diagnoses.map((item) => ({
      tooth_number: item?.tooth_number ?? null,
      icd10_code: String(item?.icd10_code || "").trim(),
      icd10_description: item?.icd10_description != null ? String(item.icd10_description) : "",
      is_primary: !!item?.is_primary,
      notes: item?.notes != null ? String(item.notes) : "",
    }));

    const invalidDiagnosis = normalizedDiagnoses.find((item) => !item.icd10_code);
    if (invalidDiagnosis) {
      console.error("[ENCOUNTER DIAGNOSES POST] Missing icd10_code in one or more diagnoses");
      return res.status(400).json({ ok: false, error: "icd10_code_required" });
    }

    const toothNumbers = Array.from(
      new Set(
        normalizedDiagnoses
          .map((item) => item.tooth_number)
          .filter((tooth) => !!tooth)
      )
    );

    let existingByTooth = new Map();
    if (toothNumbers.length > 0) {
      const { data: existingRows, error: existingRowsError } = await supabase
        .from("encounter_diagnoses")
        .select("id, tooth_number, created_at")
        .eq("encounter_id", encounterId)
        .eq("created_by_doctor_id", doctorId)
        .in("tooth_number", toothNumbers)
        .order("created_at", { ascending: false });

      if (existingRowsError) {
        console.error("[ENCOUNTER DIAGNOSES POST] Existing diagnosis lookup failed:", existingRowsError.message);
        return res.status(500).json({ ok: false, error: "existing_lookup_failed", details: existingRowsError.message });
      }

      existingByTooth = (existingRows || []).reduce((map, row) => {
        if (!map.has(row.tooth_number)) {
          map.set(row.tooth_number, row);
        }
        return map;
      }, new Map());
    }

    const diagnosesToUpdate = [];
    const diagnosesToInsert = [];
    for (const diagnosis of normalizedDiagnoses) {
      const existingRow = diagnosis.tooth_number ? existingByTooth.get(diagnosis.tooth_number) : null;
      if (existingRow) {
        diagnosesToUpdate.push({ ...diagnosis, id: existingRow.id });
      } else {
        diagnosesToInsert.push(diagnosis);
      }
    }

    for (const updateItem of diagnosesToUpdate) {
      if (updateItem.is_primary && updateItem.tooth_number) {
        const { error: clearPrimaryError } = await supabase
          .from("encounter_diagnoses")
          .update({ is_primary: false })
          .eq("encounter_id", encounterId)
          .eq("created_by_doctor_id", doctorId)
          .eq("tooth_number", updateItem.tooth_number)
          .neq("id", updateItem.id);

        if (clearPrimaryError) {
          console.warn("[ENCOUNTER DIAGNOSES POST] Primary clear warning:", clearPrimaryError.message);
        }
      }

      const { error: updateError } = await supabase
        .from("encounter_diagnoses")
        .update({
          icd10_code: updateItem.icd10_code,
          icd10_description: updateItem.icd10_description,
          is_primary: updateItem.is_primary,
          notes: typeof updateItem.notes === "string" && updateItem.notes.trim().length > 0
            ? updateItem.notes.trim()
            : null
        })
        .eq("id", updateItem.id)
        .eq("encounter_id", encounterId)
        .eq("created_by_doctor_id", doctorId);

      if (updateError) {
        console.error("[ENCOUNTER DIAGNOSES POST] Update failed:", updateError.message);
        return res.status(500).json({ ok: false, error: "diagnosis_update_failed", details: updateError.message });
      }
    }

    let transactionResult = null;
    if (diagnosesToInsert.length > 0) {
      const rpcResponse = await supabase.rpc('save_diagnoses_atomic', {
        p_encounter_id: encounterId,
        p_doctor_id: doctorId,
        p_diagnoses: diagnosesToInsert
      });
      transactionResult = rpcResponse.data;

      if (rpcResponse.error) {
        console.error("[ENCOUNTER DIAGNOSES POST] Transaction error:", rpcResponse.error);
        return res.status(500).json({ 
          ok: false, 
          error: "transaction_failed",
          details: rpcResponse.error.message 
        });
      }
    }

    const diagnosesWithNotes = diagnosesToInsert
      .filter((item) => item.tooth_number && typeof item.notes === "string" && item.notes.trim().length > 0)
      .map((item) => ({
        tooth_number: item.tooth_number,
        icd10_code: item.icd10_code,
        notes: item.notes.trim()
      }));

    for (const noteItem of diagnosesWithNotes) {
      const { data: latestDiagnosis, error: latestDiagnosisError } = await supabase
        .from("encounter_diagnoses")
        .select("id")
        .eq("encounter_id", encounterId)
        .eq("created_by_doctor_id", doctorId)
        .eq("tooth_number", noteItem.tooth_number)
        .eq("icd10_code", noteItem.icd10_code)
        .order("created_at", { ascending: false })
        .limit(1);

      if (latestDiagnosisError || !latestDiagnosis || latestDiagnosis.length === 0) {
        if (latestDiagnosisError) {
          console.warn("[ENCOUNTER DIAGNOSES POST] Notes lookup warning:", latestDiagnosisError.message);
        }
        continue;
      }

      const targetId = latestDiagnosis[0]?.id;
      if (!targetId) {
        continue;
      }

      const { error: notesUpdateError } = await supabase
        .from("encounter_diagnoses")
        .update({ notes: noteItem.notes })
        .eq("id", targetId);

      if (notesUpdateError) {
        console.warn("[ENCOUNTER DIAGNOSES POST] Notes update warning:", notesUpdateError.message);
      }
    }

    // Enhanced logging for successful transaction
    console.log("[ENCOUNTER DIAGNOSES POST] Transaction result:", {
      saved: (transactionResult?.saved || 0) + diagnosesToUpdate.length,
      encounterId,
      doctorId,
      primary_count: transactionResult?.primary_count || 0,
      updated: diagnosesToUpdate.length,
      inserted: diagnosesToInsert.length
    });

    return res.json({
      ok: true,
      diagnoses: transactionResult?.diagnoses || [],
      message: "Diagnoses saved successfully"
    });

  } catch (err) {
    console.error("[ENCOUNTER DIAGNOSES POST] Exception:", err.message);
    console.error("[ENCOUNTER DIAGNOSES POST] Stack trace:", err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/doctor/encounters/:id - Get specific encounter by ID
app.get("/api/doctor/encounters/:id", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      console.error("[ENCOUNTER BY ID] Auth failed:", v.code);
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { doctorId } = v.decoded;
    const { id: encounterId } = req.params;
    const hasAccess = await doctorHasAccessToEncounter(encounterId, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    // Enhanced logging
    console.log("[ENCOUNTER BY ID] Request:", {
      doctorId,
      encounterId,
      user: req.user,
      params: req.params
    });

    // Input validation
    if (!encounterId) {
      console.error("[ENCOUNTER BY ID] Missing encounterId");
      return res.status(400).json({ ok: false, error: "encounterId_required" });
    }

    // Rule: Doctor sadece kendi encounter'larını görebilir
    const { data: encounter, error } = await supabase
      .from("patient_encounters")
      .select(`
        *,
        patients!inner(
          id,
          name,
          phone,
          email
        )
      `)
      .eq("id", encounterId)
      .maybeSingle();

    if (error) {
      console.error("[ENCOUNTER BY ID] Database error:", error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Enhanced logging for successful query
    console.log("[ENCOUNTER BY ID] Query result:", {
      found: encounter ? 1 : 0,
      encounterId,
      doctorId
    });

    // Return 200 with null instead of 500 for not found
    return res.json({
      ok: true,
      encounter: encounter || null
    });

  } catch (err) {
    console.error("[ENCOUNTER BY ID] Exception:", err.message);
    console.error("[ENCOUNTER BY ID] Stack trace:", err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/doctor/encounters/:id - Update encounter
app.put("/api/doctor/encounters/:id", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      console.error("[ENCOUNTER PUT] Auth failed:", v.code);
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { doctorId } = v.decoded;
    const { id: encounterId } = req.params;
    const { status, notes } = req.body || {};
    const hasAccess = await doctorHasAccessToEncounter(encounterId, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    // Enhanced logging
    console.log("[ENCOUNTER PUT] Request:", {
      doctorId,
      encounterId,
      status,
      notes,
      user: req.user,
      params: req.params
    });

    // Input validation
    if (!encounterId) {
      console.error("[ENCOUNTER PUT] Missing encounterId");
      return res.status(400).json({ ok: false, error: "encounterId_required" });
    }

    const { data: existingEncounter, error: ownershipError } = await supabase
      .from("patient_encounters")
      .select("id, created_by_doctor_id, status, notes")
      .eq("id", encounterId)
      .maybeSingle();

    if (ownershipError || !existingEncounter) {
      console.error("[ENCOUNTER PUT] Ownership check failed");
      return res.status(404).json({ ok: false, error: "encounter_not_found" });
    }

    const ownerDoctorId = String(existingEncounter?.created_by_doctor_id || doctorId || "").trim();

    // Update encounter
    const { data: updatedEncounter, error: updateError } = await supabase
      .from("patient_encounters")
      .update({
        status: status || existingEncounter.status,
        notes: notes || existingEncounter.notes,
        updated_at: new Date().toISOString()
      })
      .eq("id", encounterId)
      .select()
      .single();

    if (updateError) {
      console.error("[ENCOUNTER PUT] Update error:", updateError.message);
      return res.status(500).json({ ok: false, error: updateError.message });
    }

    // Enhanced logging for successful update
    console.log("[ENCOUNTER PUT] Update result:", {
      updated: updatedEncounter ? 1 : 0,
      encounterId,
      doctorId
    });

    return res.json({
      ok: true,
      encounter: updatedEncounter
    });

  } catch (err) {
    console.error("[ENCOUNTER PUT] Exception:", err.message);
    console.error("[ENCOUNTER PUT] Stack trace:", err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/doctor/encounters/:id/status - Update encounter status
app.patch("/api/doctor/encounters/:id/status", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      console.error("[ENCOUNTER PATCH STATUS] Auth failed:", v.code);
      return res.status(401).json({ ok: false, error: v.code });
    }

    const { doctorId } = v.decoded;
    const { id: encounterId } = req.params;
    const { status } = req.body || {};
    const hasAccess = await doctorHasAccessToEncounter(encounterId, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    // Enhanced logging
    console.log("[ENCOUNTER PATCH STATUS] Request:", {
      doctorId,
      encounterId,
      status,
      user: req.user,
      params: req.params
    });

    // Input validation
    if (!encounterId) {
      console.error("[ENCOUNTER PATCH STATUS] Missing encounterId");
      return res.status(400).json({ ok: false, error: "encounterId_required" });
    }

    if (!status) {
      console.error("[ENCOUNTER PATCH STATUS] Missing status");
      return res.status(400).json({ ok: false, error: "status_required" });
    }

    const { data: existingEncounter, error: ownershipError } = await supabase
      .from("patient_encounters")
      .select("id, created_by_doctor_id")
      .eq("id", encounterId)
      .maybeSingle();

    if (ownershipError || !existingEncounter) {
      console.error("[ENCOUNTER PATCH STATUS] Ownership check failed");
      return res.status(404).json({ ok: false, error: "encounter_not_found" });
    }

    const normalizedStatus = String(status || "").trim().toUpperCase();
    const statusCandidates = [
      ...new Set([normalizedStatus, normalizedStatus.toLowerCase(), String(status).trim()].filter(Boolean)),
    ];

    let updatedEncounter = null;
    let updateError = null;

    for (const statusCandidate of statusCandidates) {
      const updateAttempt = await supabase
        .from("patient_encounters")
        .update({
          status: statusCandidate,
          updated_at: new Date().toISOString()
        })
        .eq("id", encounterId)
        .eq("created_by_doctor_id", doctorId)
        .select()
        .single();

      if (!updateAttempt.error && updateAttempt.data) {
        updatedEncounter = updateAttempt.data;
        updateError = null;
        break;
      }

      updateError = updateAttempt.error;
      const isConstraintMismatch = ["23514", "22P02", "PGRST204"].includes(String(updateAttempt.error?.code || ""));
      if (!isConstraintMismatch) {
        break;
      }
    }

    if (updateError || !updatedEncounter) {
      console.error("[ENCOUNTER PATCH STATUS] Update error:", updateError?.message || updateError);
      return res.status(500).json({ ok: false, error: updateError?.message || "encounter_status_update_failed" });
    }

    // Enhanced logging for successful update
    console.log("[ENCOUNTER PATCH STATUS] Update result:", {
      updated: updatedEncounter ? 1 : 0,
      encounterId,
      doctorId,
      newStatus: status
    });

    return res.json({
      ok: true,
      encounter: updatedEncounter
    });

  } catch (err) {
    console.error("[ENCOUNTER PATCH STATUS] Exception:", err.message);
    console.error("[ENCOUNTER PATCH STATUS] Stack trace:", err.stack);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ⚠️ Admin architecture uses UUID id only.
// patient_id (string) is legacy and not used in admin logic.

/* ================= ENCOUNTER NOTES (APPEND-ONLY) ================= */

app.get("/api/doctor/encounters/:id/notes", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code || "missing_token" });
    }

    const encounterId = String(req.params.id || "").trim();
    if (!encounterId) {
      return res.status(400).json({ ok: false, error: "encounter_id_required" });
    }

    const hasAccess = await doctorHasAccessToEncounter(encounterId, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const { data, error } = await listEncounterNotes(encounterId);
    if (error) {
      if (isMissingRelationError(error)) {
        return res.status(500).json({ ok: false, error: "encounter_notes_table_missing" });
      }
      console.error("[ENCOUNTER NOTES] list error:", error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const actorDoctorKeys = [
      ...new Set(
        [
          ...(await resolveEncounterDoctorOwnerCandidates(v.decoded)),
          String(v.decoded?.doctorId || "").trim(),
          String(v.decoded?.patientId || "").trim(),
        ].filter(Boolean),
      ),
    ];
    const notes = (data || []).map((row) => normalizeEncounterNote(row, actorDoctorKeys));
    return res.json({ ok: true, notes });
  } catch (error) {
    console.error("[ENCOUNTER NOTES] list exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/doctor/encounters/:id/notes", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code || "missing_token" });
    }

    const encounterId = String(req.params.id || "").trim();
    const content = String(req.body?.content || "").trim();
    if (!encounterId) {
      return res.status(400).json({ ok: false, error: "encounter_id_required" });
    }
    if (!content) {
      return res.status(400).json({ ok: false, error: "content_required" });
    }

    const hasAccess = await doctorHasAccessToEncounter(encounterId, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const doctorKey = String(v.decoded?.doctorId || "").trim();
    const payloadCandidates = [
      {
        encounter_id: encounterId,
        doctor_id: doctorKey,
        content,
        is_edited: false,
        is_correction: false,
        author_role: "DOCTOR",
      },
      {
        encounter_id: encounterId,
        doctor_id: doctorKey,
        content,
        is_edited: false,
        is_correction: false,
      },
      {
        encounter_id: encounterId,
        doctor_id: doctorKey,
        content,
      },
    ];

    let inserted = null;
    let insertError = null;
    for (const payload of payloadCandidates) {
      const result = await supabase
        .from("encounter_notes")
        .insert(payload)
        .select("id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,author_role,created_at")
        .single();

      if (!result.error && result.data) {
        inserted = result.data;
        insertError = null;
        break;
      }

      insertError = result.error;
      if (!isMissingRelationError(result.error)) {
        break;
      }
    }

    if ((!inserted || insertError) && isMissingRelationError(insertError)) {
      const fallbackCreate = await createEncounterNoteFromEvents({
        encounterId,
        doctorId: doctorKey,
        content,
        isCorrection: false,
        correctionFor: null,
        authorRole: "DOCTOR",
      });

      inserted = fallbackCreate.data;
      insertError = fallbackCreate.error;
    }

    if (insertError || !inserted) {
      console.error("[ENCOUNTER NOTES] create error:", insertError);
      return res.status(500).json({ ok: false, error: "note_create_failed" });
    }

    await logEncounterNoteAudit({
      action: "NOTE_CREATE",
      noteId: inserted.id,
      encounterId,
      actorId: doctorKey,
      actorRole: "DOCTOR",
      metadata: { is_correction: false },
    });

    const actorDoctorKeys = [
      ...new Set(
        [
          ...(await resolveEncounterDoctorOwnerCandidates(v.decoded)),
          String(v.decoded?.doctorId || "").trim(),
          String(v.decoded?.patientId || "").trim(),
        ].filter(Boolean),
      ),
    ];
    return res.json({ ok: true, note: normalizeEncounterNote(inserted, actorDoctorKeys) });
  } catch (error) {
    console.error("[ENCOUNTER NOTES] create exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.put("/api/doctor/notes/:noteId", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code || "missing_token" });
    }

    const noteId = String(req.params.noteId || "").trim();
    const newContent = String(req.body?.content || "").trim();
    if (!noteId) {
      return res.status(400).json({ ok: false, error: "note_id_required" });
    }
    if (!newContent) {
      return res.status(400).json({ ok: false, error: "content_required" });
    }

    const noteResult = await fetchEncounterNoteById(noteId);
    if (noteResult.error) {
      if (isMissingRelationError(noteResult.error)) {
        return res.status(500).json({ ok: false, error: "encounter_notes_table_missing" });
      }
      console.error("[ENCOUNTER NOTES] edit lookup error:", noteResult.error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const note = noteResult.data;
    if (!note) {
      return res.status(404).json({ ok: false, error: "note_not_found" });
    }

    const hasAccess = await doctorHasAccessToEncounter(note.encounter_id, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const actorDoctorKeys = [
      ...new Set(
        [
          ...(await resolveEncounterDoctorOwnerCandidates(v.decoded)),
          String(v.decoded?.doctorId || "").trim(),
          String(v.decoded?.patientId || "").trim(),
        ].filter(Boolean),
      ),
    ];
    const ownerDoctorId = String(note?.doctor_id || "").trim();
    if (!actorDoctorKeys.includes(ownerDoctorId)) {
      return res.status(403).json({ ok: false, error: "Cannot edit others' notes" });
    }

    const createdTs = Date.parse(String(note?.created_at || ""));
    if (!Number.isFinite(createdTs) || Date.now() - createdTs > ENCOUNTER_NOTE_EDIT_WINDOW_MS) {
      return res.status(403).json({ ok: false, error: "edit_window_expired", message: "Edit süresi doldu. Correction note ekleyebilirsiniz." });
    }

    const updateCandidates = [
      {
        content: newContent,
        is_edited: true,
        edited_at: new Date().toISOString(),
        edited_by: String(v.decoded?.doctorId || "").trim(),
      },
      {
        content: newContent,
        is_edited: true,
        edited_at: new Date().toISOString(),
      },
      {
        content: newContent,
      },
    ];

    let updated = null;
    let updateError = null;
    for (const payload of updateCandidates) {
      const result = await supabase
        .from("encounter_notes")
        .update(payload)
        .eq("id", noteId)
        .select("id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,author_role,created_at")
        .single();

      if (!result.error && result.data) {
        updated = result.data;
        updateError = null;
        break;
      }

      updateError = result.error;
      if (!isMissingRelationError(result.error)) break;
    }

    if ((!updated || updateError) && isMissingRelationError(updateError)) {
      const fallbackUpdate = await updateEncounterNoteFromEvents(noteId, {
        content: newContent,
        is_edited: true,
        edited_at: new Date().toISOString(),
        edited_by: String(v.decoded?.doctorId || "").trim(),
      });
      updated = fallbackUpdate.data;
      updateError = fallbackUpdate.error;
    }

    if (updateError || !updated) {
      console.error("[ENCOUNTER NOTES] edit error:", updateError);
      return res.status(500).json({ ok: false, error: "note_edit_failed" });
    }

    await logEncounterNoteAudit({
      action: "NOTE_EDIT",
      noteId: updated.id,
      encounterId: updated.encounter_id,
      actorId: String(v.decoded?.doctorId || "").trim(),
      actorRole: "DOCTOR",
      metadata: { is_edited: true },
    });

    return res.json({ ok: true, note: normalizeEncounterNote(updated, actorDoctorKeys) });
  } catch (error) {
    console.error("[ENCOUNTER NOTES] edit exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/doctor/notes/:noteId/correction", async (req, res) => {
  try {
    const v = verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: v.code || "missing_token" });
    }

    const noteId = String(req.params.noteId || "").trim();
    const correctionText = String(req.body?.content || "").trim();
    if (!noteId) {
      return res.status(400).json({ ok: false, error: "note_id_required" });
    }
    if (!correctionText) {
      return res.status(400).json({ ok: false, error: "content_required" });
    }

    const originalResult = await fetchEncounterNoteById(noteId);
    if (originalResult.error) {
      if (isMissingRelationError(originalResult.error)) {
        return res.status(500).json({ ok: false, error: "encounter_notes_table_missing" });
      }
      console.error("[ENCOUNTER NOTES] correction lookup error:", originalResult.error);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    const original = originalResult.data;
    if (!original) {
      return res.status(404).json({ ok: false, error: "note_not_found" });
    }

    const hasAccess = await doctorHasAccessToEncounter(original.encounter_id, v.decoded);
    if (!hasAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const doctorKey = String(v.decoded?.doctorId || "").trim();
    const payloadCandidates = [
      {
        encounter_id: original.encounter_id,
        doctor_id: doctorKey,
        content: correctionText,
        is_correction: true,
        correction_for: original.id,
        author_role: "DOCTOR",
      },
      {
        encounter_id: original.encounter_id,
        doctor_id: doctorKey,
        content: correctionText,
        is_correction: true,
        correction_for: original.id,
      },
      {
        encounter_id: original.encounter_id,
        doctor_id: doctorKey,
        content: correctionText,
      },
    ];

    let inserted = null;
    let insertError = null;
    for (const payload of payloadCandidates) {
      const result = await supabase
        .from("encounter_notes")
        .insert(payload)
        .select("id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,author_role,created_at")
        .single();

      if (!result.error && result.data) {
        inserted = result.data;
        insertError = null;
        break;
      }

      insertError = result.error;
      if (!isMissingRelationError(result.error)) break;
    }

    if ((!inserted || insertError) && isMissingRelationError(insertError)) {
      const fallbackCreate = await createEncounterNoteFromEvents({
        encounterId: original.encounter_id,
        doctorId: doctorKey,
        content: correctionText,
        isCorrection: true,
        correctionFor: original.id,
        authorRole: "DOCTOR",
      });
      inserted = fallbackCreate.data;
      insertError = fallbackCreate.error;
    }

    if (insertError || !inserted) {
      console.error("[ENCOUNTER NOTES] correction insert error:", insertError);
      return res.status(500).json({ ok: false, error: "correction_create_failed" });
    }

    await logEncounterNoteAudit({
      action: "NOTE_CORRECTION_ADD",
      noteId: inserted.id,
      encounterId: inserted.encounter_id,
      actorId: doctorKey,
      actorRole: "DOCTOR",
      metadata: { correction_for: original.id },
    });

    const actorDoctorKeys = [
      ...new Set(
        [
          ...(await resolveEncounterDoctorOwnerCandidates(v.decoded)),
          String(v.decoded?.doctorId || "").trim(),
          String(v.decoded?.patientId || "").trim(),
        ].filter(Boolean),
      ),
    ];
    return res.json({ ok: true, note: normalizeEncounterNote(inserted, actorDoctorKeys) });
  } catch (error) {
    console.error("[ENCOUNTER NOTES] correction exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.post("/api/admin/encounters/:id/notes", adminAuth, async (req, res) => {
  try {
    const encounterId = String(req.params.id || "").trim();
    const content = String(req.body?.content || "").trim();
    if (!encounterId) {
      return res.status(400).json({ ok: false, error: "encounter_id_required" });
    }
    if (!content) {
      return res.status(400).json({ ok: false, error: "content_required" });
    }

    const encounterLookup = await supabase
      .from("patient_encounters")
      .select("id")
      .eq("id", encounterId)
      .maybeSingle();

    if (encounterLookup.error || !encounterLookup.data) {
      return res.status(404).json({ ok: false, error: "encounter_not_found" });
    }

    const adminId = String(req.admin?.adminId || "").trim();
    const payloadCandidates = [
      {
        encounter_id: encounterId,
        doctor_id: adminId,
        content,
        is_correction: false,
        author_role: "ADMIN",
      },
      {
        encounter_id: encounterId,
        doctor_id: adminId,
        content,
        is_correction: false,
      },
      {
        encounter_id: encounterId,
        doctor_id: adminId,
        content,
      },
    ];

    let inserted = null;
    let insertError = null;
    for (const payload of payloadCandidates) {
      const result = await supabase
        .from("encounter_notes")
        .insert(payload)
        .select("id,encounter_id,doctor_id,content,is_edited,edited_at,edited_by,is_correction,correction_for,author_role,created_at")
        .single();

      if (!result.error && result.data) {
        inserted = result.data;
        insertError = null;
        break;
      }

      insertError = result.error;
      if (!isMissingRelationError(result.error)) break;
    }

    if ((!inserted || insertError) && isMissingRelationError(insertError)) {
      const fallbackCreate = await createEncounterNoteFromEvents({
        encounterId,
        doctorId: adminId,
        content,
        isCorrection: false,
        correctionFor: null,
        authorRole: "ADMIN",
      });
      inserted = fallbackCreate.data;
      insertError = fallbackCreate.error;
    }

    if (insertError || !inserted) {
      console.error("[ADMIN ENCOUNTER NOTES] create error:", insertError);
      return res.status(500).json({ ok: false, error: "note_create_failed" });
    }

    await logEncounterNoteAudit({
      action: "ADMIN_NOTE_CREATE",
      noteId: inserted.id,
      encounterId,
      actorId: adminId,
      actorRole: "ADMIN",
      metadata: { is_admin_annotation: true },
    });

    return res.json({ ok: true, note: normalizeEncounterNote(inserted, []) });
  } catch (error) {
    console.error("[ADMIN ENCOUNTER NOTES] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENT DETAIL ================= */
app.get("/api/admin/patients/:patientId", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin?.clinicId;

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }

    console.log("[ADMIN PATIENT DETAIL] clinic debug", {
      patientId,
      clinicId,
      adminId: req.admin?.id || null,
    });

    // Fetch patient from patients table
    const { data: patient, error } = await supabase
      .from("patients")
      .select(`
        id,
        name,
        email,
        phone,
        status,
        created_at,
        updated_at,
        primary_doctor_id,
        doctors:primary_doctor_id (
          id,
          name,
          email
        )
      `)
      .eq("clinic_id", clinicId)
      .eq("id", patientId)
      .single();

    if (error || !patient) {
      console.error("[ADMIN PATIENT DETAIL] Error:", error);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const plansRes = await supabase
      .from("treatment_plans")
      .select("id, status, created_at, finalized_at, encounter_id, patient_encounters!left(id, patient_id)")
      .eq("patient_encounters.patient_id", patientId)
      .order("created_at", { ascending: false });

    const plans = Array.isArray(plansRes.data) ? plansRes.data : [];
    const planIds = plans.map((plan) => plan.id).filter(Boolean);

    let procedures = [];
    let proceduresError = null;

    if (planIds.length > 0) {
      const procedureSelectCandidates = [
        "id, treatment_plan_id, patient_id, doctor_id, clinic_id, title, procedure_name, procedure_code, status, scheduled_date, start_time, end_time, created_at, updated_at, finalized_at",
        "id, treatment_plan_id, patient_id, doctor_id, title, procedure_name, procedure_code, status, scheduled_date, created_at, updated_at",
      ];

      for (const selectClause of procedureSelectCandidates) {
        const result = await supabase
          .from("procedures")
          .select(selectClause)
          .in("treatment_plan_id", planIds)
          .order("created_at", { ascending: false });

        if (!result.error) {
          procedures = Array.isArray(result.data) ? result.data : [];
          proceduresError = null;
          break;
        }

        proceduresError = result.error;
        const code = String(result.error?.code || "");
        if (!["42703", "PGRST204"].includes(code)) {
          break;
        }
      }
    }

    console.log("[ADMIN PATIENT DETAIL] procedures raw query result", {
      clinicId,
      patientId,
      planCount: planIds.length,
      proceduresCount: procedures.length,
      procedures,
      proceduresError,
    });

    if (proceduresError && procedures.length === 0 && planIds.length > 0) {
      console.warn("[ADMIN PATIENT DETAIL] primary procedures query failed, trying treatment_items fallback");
      const fallbackItems = await supabase
        .from("treatment_items")
        .select("id, treatment_plan_id, procedure_name, procedure_code, status, created_at, updated_at")
        .in("treatment_plan_id", planIds)
        .order("created_at", { ascending: false });

      if (!fallbackItems.error && Array.isArray(fallbackItems.data)) {
        procedures = fallbackItems.data.map((item) => ({
          id: item.id,
          treatment_plan_id: item.treatment_plan_id,
          patient_id: patientId,
          doctor_id: null,
          clinic_id: clinicId,
          title: item.procedure_name || item.procedure_code || "Procedure",
          procedure_name: item.procedure_name || null,
          procedure_code: item.procedure_code || null,
          status: item.status || null,
          scheduled_date: null,
          start_time: null,
          end_time: null,
          created_at: item.created_at || null,
          updated_at: item.updated_at || null,
          finalized_at: null,
        }));

        console.log("[ADMIN PATIENT DETAIL] treatment_items fallback raw query result", {
          count: procedures.length,
          procedures,
        });
      }
    }

    res.json({
      ok: true,
      patient: {
        ...patient,
        treatment_plans: plans,
        procedures,
      }
    });
  } catch (err) {
    console.error("[ADMIN PATIENT DETAIL] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN ASSIGN PRIMARY DOCTOR ================= */
app.post("/api/admin/assign-primary-doctor", adminAuth, async (req, res) => {
  try {
    const { patient_id, doctor_id } = req.body;

    if (!patient_id || !doctor_id) {
      return res.status(400).json({ ok: false, error: "patient_id_and_doctor_id_required" });
    }

    if (!req.admin.clinicId) {
      return res.status(403).json({ ok: false, error: "clinic_not_authenticated" });
    }

    const { error } = await supabase
      .from("patients")
      .update({ primary_doctor_id: doctor_id })
      .eq("id", patient_id)
      .eq("clinic_id", req.admin.clinicId);

    if (error) {
      console.error("Assign primary doctor error:", error);
      return res.status(500).json({ ok: false, error: "update_failed" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Assign primary doctor exception:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENT MESSAGES ================= */
app.get("/api/admin/patient/:patientId/messages", adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin?.clinicId;

    console.log("[ADMIN PATIENT MESSAGES] Request:", { patientId, clinicId });

    // Validate inputs
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    if (!clinicId) {
      console.error("[ADMIN PATIENT MESSAGES] Missing clinicId:", { admin: req.admin });
      return res.status(400).json({ ok: false, error: "missing_clinic_id" });
    }

    // Verify patient belongs to admin's clinic
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, clinic_id, name")
      .eq("id", patientId)
      .eq("clinic_id", clinicId)
      .single();

    if (patientError || !patient) {
      console.error("[ADMIN PATIENT MESSAGES] Patient not found:", { patientId, clinicId, patientError });
      return res.status(404).json({ ok: false, error: "Patient not found" });
    }

    // Get messages for this patient
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[ADMIN PATIENT MESSAGES] Database error:", messagesError);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_messages" });
    }

    console.log(`[ADMIN PATIENT MESSAGES] Found ${messages?.length || 0} messages for patient ${patientId}`);

    res.json({
      ok: true,
      messages: messages || []
    });

  } catch (error) {
    console.error("[ADMIN PATIENT MESSAGES] Fatal error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN UNREAD COUNT ================= */
app.get("/api/admin/unread-count", adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin?.clinicId;

    console.log("[ADMIN UNREAD COUNT] Request:", { clinicId });

    // Validate inputs
    if (!clinicId) {
      console.error("[ADMIN UNREAD COUNT] Missing clinicId:", { admin: req.admin });
      return res.status(400).json({ ok: false, error: "missing_clinic_id" });
    }

    // Get all unread messages for this clinic
    // Using the actual schema: from_patient = true for patient messages
    // Filter by clinic_code directly from messages table
    const { count, error: messagesError } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("clinic_code", req.admin.clinicCode || clinicId) // Use clinic_code from admin token
      .eq("from_patient", true);

    if (messagesError) {
      console.error("[ADMIN UNREAD COUNT] Messages fetch error:", messagesError);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_messages" });
    }

    const unreadCount = count || 0;

    console.log(`[ADMIN UNREAD COUNT] Found ${unreadCount} unread messages for clinic ${clinicId}`);

    res.json({
      ok: true,
      unreadCount
    });

  } catch (error) {
    console.error("[ADMIN UNREAD COUNT] Fatal error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN DOCTORS ================= */
app.get("/api/admin/doctors", adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Only get from doctors table - proper role separation
    const { data: doctors, error } = await supabase
      .from("doctors")
      .select(`
        id,
        doctor_id,
        name,
        full_name,
        email,
        phone,
        department,
        specialties,
        status,
        role,
        created_at,
        updated_at
      `)
      .eq("clinic_id", req.admin.clinicId)
      // List all clinic doctors for assignment (legacy rows may have role NULL; primary_doctor_id FK still points here)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN DOCTORS] Error:", error);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_doctors" });
    }

    // 🔥 CRITICAL: Return only doctors table data - no patients table mixing
    const normalizeDoctorName = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const normalized = text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[^a-zçğıöşü0-9 ]/gi, "")
        .trim();
      if (!normalized) return "";
      if (["unknown", "unknown unknown", "null", "undefined", "n/a", "na", "-", "--"].includes(normalized)) {
        return "";
      }
      return text;
    };

    const formattedDoctors = (doctors || []).map((doctor) => {
      const preferredName =
        normalizeDoctorName(doctor.name) ||
        normalizeDoctorName(doctor.full_name) ||
        String(doctor.email || "Doctor").trim() ||
        "Doctor";

      return {
        id: doctor.id,
        doctor_id: doctor.doctor_id || null,
        name: preferredName,
        email: doctor.email,
        phone: doctor.phone,
        department: doctor.department,
        specialties: doctor.specialties,
        status: doctor.status,
        role: doctor.role,
        created_at: doctor.created_at,
        updated_at: doctor.updated_at
      };
    });

    console.log(`[ADMIN DOCTORS] Fetched ${formattedDoctors.length} doctors for clinic ${req.admin.clinicId}`);

    res.json({
      ok: true,
      doctors: formattedDoctors
    });

  } catch (err) {
    console.error("[ADMIN DOCTORS] Fatal error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DEBUG CLINIC DOCTORS ================= */
app.get("/debug/clinic-doctors", adminAuth, async (req, res) => {
  try {
    console.log("[DEBUG CLINIC DOCTORS] Request received");
    console.log("[DEBUG CLINIC DOCTORS] Admin info:", { 
      adminId: req.admin.id, 
      clinicId: req.admin.clinicId 
    });

    // Get all doctors from patients table
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, role, status, department")
      .eq("clinic_id", req.admin.clinicId)
      .eq("role", "DOCTOR");

    console.log("[DEBUG CLINIC DOCTORS] Raw data:", data);
    console.log("[DEBUG CLINIC DOCTORS] Error:", error);

    // Get all users in clinic for comparison
    const { data: allUsers, error: allError } = await supabase
      .from("patients")
      .select("id, name, role, status")
      .eq("clinic_id", req.admin.clinicId);

    console.log("[DEBUG CLINIC DOCTORS] All users in clinic:", allUsers?.length || 0);
    console.log("[DEBUG CLINIC DOCTORS] All users data:", allUsers);

    res.json({ 
      data: data || [],
      error,
      allUsers: allUsers || [],
      clinicId: req.admin.clinicId
    });

  } catch (err) {
    console.error("[DEBUG CLINIC DOCTORS] Error:", err);
    res.status(500).json({ 
      data: [], 
      error: "internal_error" 
    });
  }
});

/* ================= ICD-10 DENTAL CODES ================= */
app.get("/api/icd10/dental", async (req, res) => {
  try {
    console.log("[ICD10 DENTAL] Request received");

    const { data: codes, error } = await supabase
      .from("icd10_dental_codes")
      .select("code, parent_code, description")
      .order("code", { ascending: true });

    if (error) {
      console.error("[ICD10 DENTAL] Error:", error);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_codes" });
    }

    // Group codes by hierarchy
    const mainCategories = codes.filter(code => !code.parent_code);
    const subCodes = codes.filter(code => code.parent_code);

    const hierarchicalCodes = mainCategories.map(category => ({
      code: category.code,
      description: category.description,
      subCodes: subCodes.filter(sub => sub.parent_code === category.code)
    }));

    res.json({
      ok: true,
      codes: codes || [],
      hierarchical: hierarchicalCodes
    });

  } catch (err) {
    console.error("[ICD10 DENTAL] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ICD-10 SEARCH ================= */
app.get("/api/icd10/search", async (req, res) => {
  try {
    console.log("[ICD10 SEARCH] Request received:", req.query);
    
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.json({
        ok: true,
        results: []
      });
    }

    console.log("[ICD10 SEARCH] Searching for:", q);

    const { data: codes, error } = await supabase
      .from("icd10_dental_codes")
      .select("code, parent_code, description")
      .or(`code.ilike.%${q}%,description.ilike.%${q}%`)
      .order("code", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[ICD10 SEARCH] Database error:", error);
      return res.status(500).json({ ok: false, error: "search_failed" });
    }

    console.log("[ICD10 SEARCH] Found results:", codes?.length || 0);

    res.json({
      ok: true,
      results: codes || []
    });

  } catch (err) {
    console.error("[ICD10 SEARCH] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ICD SEARCH ================= */
app.get("/api/icd/search", async (req, res) => {
  try {
    console.log("ICD SEARCH QUERY:", req.query.q);
    
    const { q } = req.query;
    
    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.json({
        ok: true,
        results: []
      });
    }

    console.log("[ICD SEARCH] Searching for:", q);
    console.log("Running ICD query...");

    const search = q.trim();

    const { data: codes, error } = await supabase
      .from("icd10_codes")
      .select("code, category")
      .or(`code.ilike.%${search}%,category.ilike.%${search}%`)
      .order("code", { ascending: true })
      .limit(20);

    if (error) {
      console.error("[ICD SEARCH] Database error:", error);
      console.error("[ICD SEARCH] Full error object:", JSON.stringify(error, null, 2));
      return res.status(500).json({ 
        ok: false, 
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    }

    console.log("[ICD SEARCH] Found results:", codes?.length || 0);

    res.json({
      ok: true,
      results: codes || []
    });

  } catch (error) {
    console.error("ICD SEARCH ERROR:", error);
    return res.status(500).json({
      ok: false,
      error: error.message,
      stack: error.stack
    });
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

/* ================= DOCTOR INITIAL EXAMINATION ================= */
app.post("/api/doctor/initial-examination", async (req, res) => {
  try {
    const { treatment_group_id, patient_id, general_notes, teeth } = req.body || {};

    console.log("[DOCTOR INITIAL EXAMINATION] Request received:", {
      treatment_group_id,
      patient_id,
      teeth_count: teeth?.length || 0
    });

    // 1️⃣ verifyDoctorToken
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded || !decoded.doctorId) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }

    const doctorId = decoded.doctorId;

    // 2️⃣ doctor treatment_group_member mı?
    const { data: member, error: memberError } = await supabase
      .from("treatment_group_members")
      .select("role, status")
      .eq("treatment_group_id", treatment_group_id)
      .eq("doctor_id", doctorId)
      .single();

    if (memberError || !member) {
      return res.status(403).json({ ok: false, error: "not_group_member" });
    }

    // 3️⃣ role PRIMARY mi?
    if (member.role !== "PRIMARY") {
      return res.status(403).json({ ok: false, error: "not_primary_doctor" });
    }

    // 4️⃣ group.status = ACTIVE mi?
    const { data: group, error: groupError } = await supabase
      .from("treatment_groups")
      .select("status")
      .eq("id", treatment_group_id)
      .single();

    if (groupError || !group || group.status !== "ACTIVE") {
      return res.status(403).json({ ok: false, error: "group_not_active" });
    }

    // 5️⃣ Aynı group için daha önce exam var mı?
    const { data: existingExam, error: existingError } = await supabase
      .from("initial_examinations")
      .select("id")
      .eq("treatment_group_id", treatment_group_id)
      .single();

    if (existingExam) {
      return res.status(409).json({ ok: false, error: "exam_already_exists" });
    }

    // Validation
    if (!treatment_group_id || !patient_id || !teeth || !Array.isArray(teeth) || teeth.length === 0) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    // Validate tooth numbers (11-48)
    const validToothNumbers = [];
    for (let i = 1; i <= 4; i++) {
      for (let j = 1; j <= 8; j++) {
        validToothNumbers.push(`${i}${j}`);
      }
    }

    for (const tooth of teeth) {
      if (!tooth.tooth_number || !validToothNumbers.includes(tooth.tooth_number)) {
        return res.status(400).json({ ok: false, error: "invalid_tooth_number" });
      }
      if (!tooth.icd10_code) {
        return res.status(400).json({ ok: false, error: "missing_icd10_code" });
      }
    }

    // 🔥 ATOMIC INSERT LOGIC
    console.log("[DOCTOR INITIAL EXAMINATION] Starting atomic insert");

    // Create initial examination
    const { data: exam, error: examError } = await supabase
      .from("initial_examinations")
      .insert({
        treatment_group_id,
        patient_id,
        doctor_id: doctorId,
        general_notes: general_notes || "",
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (examError) {
      console.error("[DOCTOR INITIAL EXAMINATION] Exam creation error:", examError);
      return res.status(500).json({ ok: false, error: "exam_creation_failed" });
    }

    console.log("[DOCTOR INITIAL EXAMINATION] Exam created:", exam.id);

    // Create teeth records
    const teethPayload = teeth.map(t => ({
      initial_examination_id: exam.id,
      tooth_number: t.tooth_number,
      icd10_code: t.icd10_code,
      diagnosis_note: t.diagnosis_note || ""
    }));

    const { error: teethError } = await supabase
      .from("initial_exam_teeth")
      .insert(teethPayload);

    if (teethError) {
      console.error("[DOCTOR INITIAL EXAMINATION] Teeth insertion error:", teethError);
      
      // Rollback: Delete the examination
      await supabase
        .from("initial_examinations")
        .delete()
        .eq("id", exam.id);

      return res.status(500).json({ ok: false, error: "teeth_creation_failed" });
    }

    console.log("[DOCTOR INITIAL EXAMINATION] Success:", {
      exam_id: exam.id,
      teeth_count: teeth.length
    });

    res.json({
      ok: true,
      examination: {
        id: exam.id,
        treatment_group_id,
        patient_id,
        doctor_id: doctorId,
        general_notes,
        teeth: teeth,
        created_at: exam.created_at
      }
    });

  } catch (err) {
    console.error("[DOCTOR INITIAL EXAMINATION] Error:", err);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
    
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
  // Safe patientId resolution
  const requestedPatientId = String(req.params.patientId || "").trim();
  
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

  // Decode token to get patientId
  let decoded;
  try {
    decoded = jwt.decode(authToken);
    if (!decoded) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  } catch (error) {
    console.error("Messages GET - Token decode error:", error);
    return res.status(401).json({ ok: false, error: "token_decode_failed" });
  }

  // Safe patientId resolution logic
  let patientId;
  
  if (decoded.role === "PATIENT") {
    // Patients can only access their own data
    patientId = decoded.patientId;
  } else {
    // Admin/Doctor can use requested patientId or fallback to token
    if (
      requestedPatientId &&
      requestedPatientId !== "undefined" &&
      requestedPatientId !== "null" &&
      requestedPatientId !== ""
    ) {
      patientId = requestedPatientId;
    } else {
      patientId = decoded.patientId;
    }
  }

  // Logging guard
  if (!patientId) {
    console.error("Messages GET - Invalid patientId after resolution:", {
      requestedPatientId,
      tokenPatientId: decoded.patientId,
      role: decoded.role,
      actor
    });
    return res.status(400).json({ ok: false, error: "invalid_patient_id" });
  }

  try {
    console.log("Messages GET - Request:", { 
      patientId, 
      requestedPatientId,
      tokenPatientId: decoded.patientId,
      role: decoded.role,
      actor,
      headers: req.headers 
    });

    let isAdmin = false;
    let clinicId;

    try {
      decoded = jwt.verify(authToken, JWT_SECRET);
      const hasPatientId = decoded.patientId !== null && decoded.patientId !== undefined && String(decoded.patientId || "").trim() !== "";
      const hasClinicCode = decoded.clinicCode !== null && decoded.clinicCode !== undefined;
      const hasClinicId = decoded.clinicId !== null && decoded.clinicId !== undefined;
      isAdmin = actor === "admin" || (hasClinicCode && hasClinicId && !hasPatientId);
      clinicId = decoded.clinicId;
    } catch (err) {
      console.error("Messages GET - Token verification failed:", err.message);
      // Token invalid, continue without auth (might be public endpoint)
    }

    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "missing_patient_id" });
    }
    
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
    if (!isAdmin && patientData.role !== "DOCTOR" && patientData.status !== "ACTIVE") {
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
function normalizeMedicalForm(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function computeMedicalRiskFlags(formDataInput) {
  const formData = normalizeMedicalForm(formDataInput);
  const flags = [];
  const pushFlag = (type, code, label) => {
    const normalizedType = String(type || "").toLowerCase() === "critical" ? "critical" : "relevant";
    const normalizedCode = String(code || "").trim().toUpperCase();
    const normalizedLabel = String(label || "").trim();
    if (!normalizedCode || !normalizedLabel) return;
    if (flags.some((item) => item.code === normalizedCode)) return;
    flags.push({ type: normalizedType, code: normalizedCode, label: normalizedLabel });
  };

  const allergies = normalizeMedicalForm(formData.allergies);
  const medications = normalizeMedicalForm(formData.medications);
  const dentalHistory = normalizeMedicalForm(formData.dentalHistory);
  const generalHealth = normalizeMedicalForm(formData.generalHealth);
  const conditions = Array.isArray(generalHealth.conditions)
    ? generalHealth.conditions.map((value) => String(value || "").trim().toLowerCase())
    : [];

  if (!allergies.none && (allergies.penicillin || allergies.localAnesthesia || allergies.latex || allergies.other)) {
    const allergyDetails = String(allergies.allergyDetails || "").trim();
    pushFlag("critical", "DRUG_ALLERGY", allergyDetails ? `Drug Allergy: ${allergyDetails}` : "Drug Allergy");
  }

  if (medications.bloodThinner || conditions.includes("bleeding_disorder")) {
    pushFlag("critical", "BLEEDING_RISK", "Bleeding / Anticoagulant Risk");
  }

  if (conditions.includes("diabetes")) {
    pushFlag("relevant", "DIABETES", "Diabetes");
  }
  if (conditions.includes("heart_disease")) {
    pushFlag("relevant", "HEART_DISEASE", "Heart Disease");
  }
  if (conditions.includes("hypertension")) {
    pushFlag("relevant", "HYPERTENSION", "Hypertension");
  }
  if (conditions.includes("asthma")) {
    pushFlag("relevant", "ASTHMA", "Asthma / Respiratory Disease");
  }
  if (conditions.includes("epilepsy")) {
    pushFlag("relevant", "EPILEPSY", "Epilepsy");
  }
  if (conditions.includes("kidney_disease")) {
    pushFlag("relevant", "KIDNEY_DISEASE", "Kidney Disease");
  }
  if (conditions.includes("liver_disease")) {
    pushFlag("relevant", "LIVER_DISEASE", "Liver Disease");
  }
  if (conditions.includes("thyroid")) {
    pushFlag("relevant", "THYROID_DISEASE", "Thyroid Disease");
  }
  if (conditions.includes("cancer")) {
    pushFlag("relevant", "CANCER_HISTORY", "Cancer (Past or Active)");
  }
  if (conditions.includes("pregnancy")) {
    pushFlag("relevant", "PREGNANCY", "Pregnancy");
  }

  if (!medications.none && (medications.regularMedication || medications.cortisone || medications.antibiotics)) {
    pushFlag("relevant", "ACTIVE_MEDICATION", "Active Medication Use");
  }

  if (dentalHistory.previousProcedures || dentalHistory.previousProblems || dentalHistory.anesthesiaProblems) {
    pushFlag("relevant", "SURGICAL_HISTORY", "Dental / Surgical History");
  }

  return flags;
}

function isMissingColumnSupabaseError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return ["42703", "PGRST204", "PGRST205"].includes(code) || message.includes("does not exist") || message.includes("column");
}

async function syncMedicalSnapshotToPatient({ patientId, clinicCode, formData, medicalRiskFlags }) {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) return;

  const snapshot = {
    medical_form: normalizeMedicalForm(formData),
    medical_risk_flags: Array.isArray(medicalRiskFlags) ? medicalRiskFlags : [],
    updated_at: Date.now(),
  };

  const payload = { ...snapshot };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let query = supabase.from("patients").update(payload).eq("id", normalizedPatientId);
    if (clinicCode) {
      query = query.eq("clinic_code", String(clinicCode));
    }

    const { error } = await query;
    if (!error) return;
    if (!isMissingColumnSupabaseError(error)) return;

    const missingCol = ["medical_form", "medical_risk_flags", "updated_at"].find((column) =>
      String(error.message || "").includes(column)
    );

    if (!missingCol || !(missingCol in payload)) return;
    delete payload[missingCol];
    if (!Object.keys(payload).length) return;
  }
}

async function getHealthFormWithFlags({ patientId, clinicCode }) {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) {
    return { ok: false, status: 400, error: "patient_id_required" };
  }

  let query = supabase
    .from("patient_health_forms")
    .select("id, patient_id, clinic_code, form_data, risk_flags, is_complete, completed_at, updated_at")
    .eq("patient_id", normalizedPatientId);

  if (clinicCode) {
    query = query.eq("clinic_code", String(clinicCode));
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return { ok: false, status: 500, error: "health_form_fetch_failed", details: error.message };
  }

  if (!data) {
    return {
      ok: true,
      formData: null,
      medicalRiskFlags: [],
      isComplete: false,
      completedAt: null,
      updatedAt: null,
    };
  }

  const formData = normalizeMedicalForm(data.form_data);
  const flagsFromDb = Array.isArray(data.risk_flags) ? data.risk_flags : [];
  const medicalRiskFlags = flagsFromDb.length ? flagsFromDb : computeMedicalRiskFlags(formData);

  return {
    ok: true,
    formData,
    medicalRiskFlags,
    isComplete: data.is_complete === true,
    completedAt: data.completed_at || null,
    updatedAt: data.updated_at || null,
  };
}

async function resolvePatientForMedicalAccess(patientIdentifier, requester) {
  const normalizedPatientId = String(patientIdentifier || "").trim();
  if (!normalizedPatientId) {
    return { ok: false, status: 400, error: "patient_id_required" };
  }

  const clinicId = String(requester?.clinicId || "").trim();
  const clinicCode = String(requester?.clinicCode || "").trim();

  let query = supabase
    .from("patients")
    .select("id, patient_id, clinic_id, clinic_code, primary_doctor_id")
    .or(`id.eq.${normalizedPatientId},patient_id.eq.${normalizedPatientId}`)
    .limit(1)
    .maybeSingle();

  if (clinicId) {
    query = query.eq("clinic_id", clinicId);
  } else if (clinicCode) {
    query = query.eq("clinic_code", clinicCode);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, status: 500, error: "patient_lookup_failed", details: error.message };
  }

  if (!data) {
    return { ok: false, status: 404, error: "patient_not_found" };
  }

  return { ok: true, patient: data };
}

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
    const medicalRiskFlags = computeMedicalRiskFlags(formData);

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
      risk_flags: medicalRiskFlags,
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

    await syncMedicalSnapshotToPatient({
      patientId,
      clinicCode,
      formData: result.form_data || {},
      medicalRiskFlags,
    });

    res.json({ 
      ok: true, 
      formData: result.form_data || {},
      medicalRiskFlags,
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
    const medicalRiskFlags = computeMedicalRiskFlags(formData);

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
      risk_flags: medicalRiskFlags,
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

    await syncMedicalSnapshotToPatient({
      patientId,
      clinicCode,
      formData: result.form_data || {},
      medicalRiskFlags,
    });

    res.json({ 
      ok: true, 
      formData: result.form_data || {},
      medicalRiskFlags,
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

app.get("/api/patients/:id/medical-summary", getUserFromToken, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (!["DOCTOR", "ADMIN"].includes(role)) {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    const patientLookup = await resolvePatientForMedicalAccess(req.params.id, req.user || {});
    if (!patientLookup.ok) {
      return res.status(patientLookup.status || 500).json({ ok: false, error: patientLookup.error, details: patientLookup.details });
    }

    const medical = await getHealthFormWithFlags({
      patientId: patientLookup.patient.id,
      clinicCode: patientLookup.patient.clinic_code || req.user?.clinicCode || null,
    });

    if (!medical.ok) {
      return res.status(medical.status || 500).json({ ok: false, error: medical.error, details: medical.details });
    }

    return res.json({ ok: true, medicalRiskFlags: medical.medicalRiskFlags || [] });
  } catch (error) {
    console.error("[PATIENT MEDICAL SUMMARY] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.get("/api/patients/:id/medical-form", getUserFromToken, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (!["DOCTOR", "ADMIN"].includes(role)) {
      return res.status(403).json({ ok: false, error: "access_denied" });
    }

    const patientLookup = await resolvePatientForMedicalAccess(req.params.id, req.user || {});
    if (!patientLookup.ok) {
      return res.status(patientLookup.status || 500).json({ ok: false, error: patientLookup.error, details: patientLookup.details });
    }

    const medical = await getHealthFormWithFlags({
      patientId: patientLookup.patient.id,
      clinicCode: patientLookup.patient.clinic_code || req.user?.clinicCode || null,
    });

    if (!medical.ok) {
      return res.status(medical.status || 500).json({ ok: false, error: medical.error, details: medical.details });
    }

    return res.json({ ok: true, medicalForm: medical.formData || {}, medicalRiskFlags: medical.medicalRiskFlags || [] });
  } catch (error) {
    console.error("[PATIENT MEDICAL FORM] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
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
      .eq("id", patientId)
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
        return { data: null, error: { message: "clinic_missing" }, source: "validation" };
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
    
    console.log(`[ADMIN REFERRALS] Found ${filteredReferrals?.length || 0} referral(s) after filter for clinic_id: ${req.admin?.clinicId}`);

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
    console.error("[ADMIN REFERRALS] Exception:", err);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "referrals_fetch_exception", details: err.message });
    }
  }
});

/* ================= ADMIN REFERRALS (POST) ================= */
app.post("/api/admin/referrals", adminAuth, async (req, res) => {
  try {
    console.log("[ADMIN REFERRALS POST] Request received, forwarding to GET handler");
    
    // Change method to GET and call the same handler
    req.method = "GET";
    req.query = req.query || {};
    
    // Call the GET handler directly
    return app._router.handle(req, res);
  } catch (err) {
    console.error("[ADMIN REFERRALS POST] Error:", err);
    return res.status(500).json({ ok: false, error: "internal_error", details: err.message });
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
  res.json({ ok: true, port: String(PORT), entry: "repo-root/index.cjs" });
});

/* ================= FAVICON ================= */
app.get("/favicon.ico", (req, res) => {
  res.status(404).send("Favicon not found");
});

/* ================= OTP VERIFICATION ================= */
// 🔥 CRITICAL: UNIFIED OTP VERIFICATION WITH TYPE-BASED RESPONSES
app.post("/auth/verify-otp", async (req, res) => {
  console.log("[OTP VERIFY] Route hit");
  
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

          // Use appropriate secret based on type
          JWT_SECRET;
          
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
          .maybeSingle();

        if (!patient) {
          return res.status(404).json({ 
            ok: false, 
            error: "patient_not_found",
            message: "Patient not found" 
          });
        }

        // Use appropriate secret based on type
        JWT_SECRET;
        
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
          .from("doctors")
          .select("*")
          .eq("phone", normalizedPhone)
          .maybeSingle();

        if (!doctor) {
          return res.status(404).json({ 
            ok: false, 
            error: "doctor_not_found",
            message: "Doctor not found" 
          });
        }

        // Use appropriate secret based on type
        JWT_SECRET;
        
        console.log("=== OTP DOCTOR SIGN DEBUG ===");
        console.log("JWT_SECRET constant:", JWT_SECRET);
        
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

        console.log("Generated token:", token);

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
          .maybeSingle();

        if (!clinic) {
          return res.status(404).json({ 
            ok: false, 
            error: "clinic_not_found",
            message: "Clinic not found" 
          });
        }

        // Use appropriate secret based on type
        JWT_SECRET;
        
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
    if (normalizedType === "patient") {
      // Find patient by phone
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      // DEV mode logging
      if (process.env.NODE_ENV !== "production") {
        console.log("[OTP VERIFY] Supabase result:", { patient, patientError });
      }

      if (!patient) {
        return res.status(404).json({ 
          ok: false, 
          error: "patient_not_found",
          message: "Patient not found" 
        });
      }

      // Use appropriate secret based on type
      JWT_SECRET;
      
      const token = jwt.sign(
        {
          patientId: patient.patient_id,
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
        .from("doctors")
        .select("*")
        .eq("phone", normalizedPhone)
        .maybeSingle();

      if (!doctor) {
        return res.status(404).json({ 
          ok: false, 
          error: "doctor_not_found",
          message: "Doctor not found" 
        });
      }

      // Use appropriate secret based on type
      JWT_SECRET;
      
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
        .maybeSingle();

      if (!clinic) {
        return res.status(404).json({ 
          ok: false, 
          error: "clinic_not_found",
          message: "Clinic not found" 
        });
      }

      // Use appropriate secret based on type
      JWT_SECRET;
      
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
    
    // Safety fallback - ensure we always return a response
    return res.status(400).json({
      ok: false,
      error: "unhandled_type",
      message: "Unhandled user type"
    });

  } catch (error) {
    console.error("[OTP VERIFY] ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: error?.message || "Unknown error"
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

// Treatment Groups routes (Admin only) - DEPRECATED - Using new endpoint in index.cjs
// const treatmentGroupsRoutes = require('./server/routes/treatment-groups');
// app.use('/api/treatment-groups', treatmentGroupsRoutes);

// Patient Group Assignments routes (Admin only)
const patientGroupAssignmentsRoutes = require('./server/routes/patient-group-assignments');
app.use('/api/patient-group-assignments', patientGroupAssignmentsRoutes);

// Patients routes (Admin only)
const patientsRoutes = require('./server/routes/patients');
app.use('/api/patients', patientsRoutes);

// Treatment routes - MUST come before doctor routes to avoid conflicts
const treatmentRoutes = require('./server/routes/treatment');
app.use('/api/treatment', treatmentRoutes);

// Doctor treatments routes
const doctorTreatmentRoutes = require('./routes/doctor/treatments');
app.use('/api/doctor', doctorTreatmentRoutes);

// Fix treatment_groups status constraint
app.post("/api/admin/fix-treatment-groups-status", adminAuth, async (req, res) => {
  try {
    console.log("[FIX TREATMENT GROUPS] Starting status normalization...");
    
    // 1️⃣ Mevcut constraint'i kaldır
    const { error: dropError } = await supabase
      .from('treatment_groups')
      .select('id')
      .limit(1);
    
    // 2️⃣ Eski veriyi normalize et
    const { data: updateResult, error: updateError } = await supabase
      .from('treatment_groups')
      .update({ status: 'OPEN' })
      .eq('status', 'ACTIVE');
    
    if (updateError) {
      console.error("[FIX TREATMENT GROUPS] Update error:", updateError);
      throw updateError;
    }
    
    console.log(`[FIX TREATMENT GROUPS] Updated ${updateResult?.length || 0} records from ACTIVE to OPEN`);
    
    // 3️⃣ Kontrol et
    const { data: checkResult } = await supabase
      .from('treatment_groups')
      .select('status');
    
    const counts = {};
    checkResult?.forEach(item => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    
    console.log("[FIX TREATMENT GROUPS] Current status counts:", counts);
    
    res.json({
      ok: true,
      message: "Treatment groups status normalization completed - Step 1: ACTIVE → OPEN",
      updatedRecords: updateResult?.length || 0,
      statusCounts: counts,
      nextStep: "Execute ALTER TABLE commands in Supabase SQL Editor"
    });
    
  } catch (error) {
    console.error("[FIX TREATMENT GROUPS] Error:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to normalize treatment groups status"
    });
  }
});

/* ================= ADMIN TIMELINE ================= */
app.get("/api/admin/timeline", adminAuth, async (req, res) => {
  try {
    // 🔥 CRITICAL: Use req.admin.clinicId instead of req.clinicId
    const clinicId = req.admin?.clinicId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // 🔥 CRITICAL: Add undefined guard
    if (!clinicId) {
      console.error("[ADMIN TIMELINE] Missing clinicId:", { 
        admin: req.admin,
        clinicId: clinicId 
      });
      return res.status(400).json({ 
        ok: false, 
        error: "Missing clinicId" 
      });
    }

    console.log("[ADMIN TIMELINE] Request:", { clinicId, limit, offset });

    // 🔥 CRITICAL: Update to new schema
    const { data, error } = await supabase
      .from("admin_timeline_events")
      .select(`
        id,
        event_type,
        entity_type,
        entity_id,
        title,
        description,
        metadata,
        created_by,
        created_at
      `)
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[ADMIN TIMELINE] Error:", error);
      return res.status(500).json({ 
        ok: false, 
        error: "failed_to_fetch_timeline",
        details: error.message 
      });
    }

    console.log(`[ADMIN TIMELINE] Fetched ${data?.length || 0} events for clinic ${clinicId}`);

    const rows = Array.isArray(data) ? data : [];

    const normalizeText = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const normalized = text.toLowerCase();
      if (["unknown", "unknown patient", "unknown doctor", "null", "undefined", "n/a", "na", "-", "--"].includes(normalized)) {
        return "";
      }
      return text;
    };

    const extractMeta = (row) => {
      if (row?.metadata && typeof row.metadata === "object") return row.metadata;
      if (typeof row?.metadata === "string") {
        try {
          const parsed = JSON.parse(row.metadata);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          return {};
        }
      }
      return {};
    };

    const patientIdSet = new Set();
    const doctorIdSet = new Set();

    rows.forEach((row) => {
      const meta = extractMeta(row);

      const patientCandidates = [
        meta?.patient_id,
        meta?.patientId,
        meta?.patient_uuid,
        meta?.patientUuid,
        row?.entity_type === "PATIENT" || row?.entity_type === "patient" ? row?.entity_id : null,
      ];
      patientCandidates.forEach((value) => {
        const key = String(value || "").trim();
        if (key) patientIdSet.add(key);
      });

      const doctorCandidates = [
        meta?.doctor_id,
        meta?.doctorId,
        meta?.assigned_doctor_id,
        meta?.assignedDoctorId,
        row?.entity_type === "DOCTOR" || row?.entity_type === "doctor" ? row?.entity_id : null,
        row?.created_by,
      ];
      doctorCandidates.forEach((value) => {
        const key = String(value || "").trim();
        if (key) doctorIdSet.add(key);
      });
    });

    const patientMap = new Map();
    if (patientIdSet.size > 0) {
      const patientIds = Array.from(patientIdSet);
      const patientSelectCandidates = [
        "id, patient_id, name, full_name, first_name, last_name",
        "id, patient_id, name, full_name",
        "id, patient_id, name, first_name, last_name",
        "id, patient_id, name",
      ];

      for (const selectClause of patientSelectCandidates) {
        const result = await supabase
          .from("patients")
          .select(selectClause)
          .or(`id.in.(${patientIds.join(",")}),patient_id.in.(${patientIds.join(",")})`);

        if (!result.error) {
          (result.data || []).forEach((patient) => {
            const keyA = String(patient?.id || "").trim();
            const keyB = String(patient?.patient_id || "").trim();
            const fullName = normalizeText(patient?.full_name);
            const first = normalizeText(patient?.first_name);
            const last = normalizeText(patient?.last_name);
            const merged = normalizeText(`${first} ${last}`.trim());
            const name = normalizeText(patient?.name) || fullName || merged || keyB || keyA;
            if (keyA && name) patientMap.set(keyA, name);
            if (keyB && name) patientMap.set(keyB, name);
          });
          break;
        }

        if (!["42703", "PGRST204", "PGRST205"].includes(String(result.error?.code || ""))) {
          console.error("[ADMIN TIMELINE] patients resolve error:", result.error);
          break;
        }
      }
    }

    const doctorMap = new Map();
    if (doctorIdSet.size > 0) {
      const doctorIds = Array.from(doctorIdSet);
      const doctorSelectCandidates = [
        "id, doctor_id, name, full_name",
        "id, doctor_id, full_name",
        "id, doctor_id, name",
        "id, name, full_name",
      ];

      for (const selectClause of doctorSelectCandidates) {
        const result = await supabase
          .from("doctors")
          .select(selectClause)
          .or(`id.in.(${doctorIds.join(",")}),doctor_id.in.(${doctorIds.join(",")})`);

        if (!result.error) {
          (result.data || []).forEach((doctor) => {
            const keyA = String(doctor?.id || "").trim();
            const keyB = String(doctor?.doctor_id || "").trim();
            const name = normalizeText(doctor?.full_name) || normalizeText(doctor?.name) || keyB || keyA;
            if (keyA && name) doctorMap.set(keyA, name);
            if (keyB && name) doctorMap.set(keyB, name);
          });
          break;
        }

        if (!["42703", "PGRST204", "PGRST205", "42P01"].includes(String(result.error?.code || ""))) {
          console.error("[ADMIN TIMELINE] doctors resolve error:", result.error);
          break;
        }
      }
    }

    const getRelativeTime = (iso) => {
      if (!iso) return "";
      const ts = Date.parse(String(iso));
      if (!Number.isFinite(ts)) return "";
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return "Az önce";
      if (mins < 60) return `${mins} dk önce`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours} saat önce`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days} gün önce`;
      const months = Math.floor(days / 30);
      return `${months} ay önce`;
    };

    const iconForEvent = (eventType) => {
      const t = String(eventType || "").toUpperCase();
      if (t.includes("TREATMENT") || t.includes("PROCEDURE")) return "🦷";
      if (t.includes("APPOINTMENT") || t.includes("SCHEDULE")) return "📅";
      if (t.includes("PATIENT")) return "👤";
      if (t.includes("DOCTOR")) return "👨‍⚕️";
      return "📝";
    };

    const formatted = rows.map((row) => {
      const meta = extractMeta(row);
      const patientId = String(
        meta?.patient_id ||
        meta?.patientId ||
        meta?.patient_uuid ||
        meta?.patientUuid ||
        ((row?.entity_type === "PATIENT" || row?.entity_type === "patient") ? row?.entity_id : "") ||
        ""
      ).trim();
      const doctorId = String(
        meta?.doctor_id ||
        meta?.doctorId ||
        meta?.assigned_doctor_id ||
        meta?.assignedDoctorId ||
        ((row?.entity_type === "DOCTOR" || row?.entity_type === "doctor") ? row?.entity_id : "") ||
        row?.created_by ||
        ""
      ).trim();

      const patientName = normalizeText(meta?.patient_name || meta?.patientName) || (patientId ? patientMap.get(patientId) || "" : "");
      const doctorName = normalizeText(meta?.doctor_name || meta?.doctorName) || (doctorId ? doctorMap.get(doctorId) || "" : "");

      let title = normalizeText(row?.title) || "Sistem Olayı";
      if (/unknown patient/i.test(title) && patientName) {
        title = title.replace(/unknown patient/ig, patientName);
      }
      if (/unknown doctor/i.test(title) && doctorName) {
        title = title.replace(/unknown doctor/ig, doctorName);
      }

      const detailParts = [];
      const description = normalizeText(row?.description || meta?.description || meta?.message);
      if (description) detailParts.push(description);
      if (patientName) detailParts.push(`Hasta: ${patientName}`);
      if (doctorName) detailParts.push(`Doktor: ${doctorName}`);

      const subtitle = detailParts.join(" • ") || "Detay yok";

      return {
        ...row,
        icon: iconForEvent(row?.event_type || row?.entity_type),
        title,
        subtitle,
        message: subtitle,
        patient_id: patientId || null,
        patient_name: patientName || null,
        doctor_id: doctorId || null,
        doctor_name: doctorName || null,
        relative_time: getRelativeTime(row?.created_at),
      };
    });

    return res.json({
      ok: true,
      events: formatted,
      data: formatted,
      total: formatted.length,
    });

  } catch (err) {
    console.error("[ADMIN TIMELINE] Fatal error:", err);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error" 
    });
  }
});

/* ================= ADMIN TIMELINE CREATE EVENT ================= */
app.post("/api/admin/timeline/events", adminAuth, async (req, res) => {
  try {
    const {
      type,
      reference_id,
      message,
      details
    } = req.body;

    const clinicId = req.admin.clinicId;
    const adminId = req.admin.adminId || req.admin.id;

    if (!type || !message) {
      return res.status(400).json({
        ok: false,
        error: "missing_required_fields",
        details: "type and message are required"
      });
    }

    // Create timeline event
    const { data: event, error } = await supabase
      .from("admin_timeline_events")
      .insert({
        clinic_id: clinicId,
        type,
        reference_id,
        message,
        details,
        created_by: adminId
      })
      .select()
      .single();

    if (error) {
      console.error("[ADMIN TIMELINE CREATE EVENT] Error:", error);
      return res.status(500).json({
        ok: false,
        error: "failed_to_create_event",
        details: error.message
      });
    }

    console.log("[ADMIN TIMELINE CREATE EVENT] Event created:", event.id);

    res.json({
      ok: true,
      event
    });

  } catch (err) {
    console.error("[ADMIN TIMELINE CREATE EVENT] Fatal error:", err);
    res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

// GET /api/doctor/chair-availability - Get available chair slots for doctor UI
app.get("/api/doctor/chair-availability", async (req, res) => {
  try {
    const date = String(req.query.date || "").trim();
    const chairInput = String(req.query.chair || req.query.chairNo || "1").trim();
    const requestedDurationRaw = Number.parseInt(String(req.query.duration_minutes ?? req.query.duration ?? "10"), 10);
    const requestedDuration = Number.isFinite(requestedDurationRaw) ? Math.max(10, Math.min(240, requestedDurationRaw)) : 10;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, error: "invalid_date", message: "date must be YYYY-MM-DD" });
    }

    const normalizeChair = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const prefixed = raw.match(/^chair\s*(\d+)$/i);
      if (prefixed) return String(Number(prefixed[1]));
      if (/^\d+$/.test(raw)) return String(Number(raw));
      return raw.toUpperCase();
    };

    const targetChair = normalizeChair(chairInput || "1");
    if (!targetChair) {
      return res.status(400).json({ ok: false, error: "invalid_chair" });
    }

    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    let decoded = null;
    if (token) {
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch {
        decoded = null;
      }
    }

    const clinicId = String(decoded?.clinicId || "").trim();
    const clinicCode = String(decoded?.clinicCode || "").trim();

    const dayStartIso = `${date}T00:00:00.000Z`;
    const nextDay = new Date(dayStartIso);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const dayEndIso = nextDay.toISOString();

    const workStartMinutes = 9 * 60;
    const workEndMinutes = 18 * 60;
    const slotMinutes = 10;

    const fetchRows = async (tableName) => {
      const attempts = [];

      if (clinicId) {
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).eq("date", date));
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).eq("appointment_date", date));
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).gte("start_at", dayStartIso).lt("start_at", dayEndIso));
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_id", clinicId).gte("startAt", dayStartIso).lt("startAt", dayEndIso));
      }

      if (clinicCode) {
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", clinicCode).eq("date", date));
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", clinicCode).eq("appointment_date", date));
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", clinicCode).gte("start_at", dayStartIso).lt("start_at", dayEndIso));
        attempts.push(() => supabase.from(tableName).select("*").eq("clinic_code", clinicCode).gte("startAt", dayStartIso).lt("startAt", dayEndIso));
      }

      attempts.push(() => supabase.from(tableName).select("*").eq("date", date));
      attempts.push(() => supabase.from(tableName).select("*").eq("appointment_date", date));

      for (const run of attempts) {
        const { data, error } = await run();
        if (!error) return Array.isArray(data) ? data : [];
        const code = String(error?.code || "");
        const msg = String(error?.message || "").toLowerCase();
        const schemaIssue = ["42P01", "42703", "PGRST204", "PGRST205"].includes(code) || msg.includes("does not exist") || msg.includes("column");
        if (schemaIssue) continue;
      }

      return [];
    };

    const [appointments, requests] = await Promise.all([
      fetchRows("appointments"),
      fetchRows("appointment_requests"),
    ]);

    const toIso = (value) => {
      if (!value) return null;
      const ts = Date.parse(String(value));
      if (!Number.isFinite(ts)) return null;
      return new Date(ts).toISOString();
    };

    const makeIsoFromDateTime = (dateValue, timeValue) => {
      const d = String(dateValue || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
      const tRaw = String(timeValue || "00:00").trim();
      const t = /^\d{2}:\d{2}$/.test(tRaw) ? `${tRaw}:00` : tRaw;
      return toIso(`${d}T${t}`);
    };

    const occupiedRanges = [];

    [...appointments, ...requests].forEach((row) => {
      const rowChair = normalizeChair(
        row?.chair ?? row?.chair_no ?? row?.chairNo ?? row?.chair_name ?? row?.chairName ?? row?.chair_id ?? row?.chairId
      );
      if (!rowChair || rowChair !== targetChair) return;

      const startIso =
        toIso(row?.start_at) ||
        toIso(row?.startAt) ||
        makeIsoFromDateTime(row?.date || row?.appointment_date, row?.time);
      if (!startIso) return;

      const startTs = Date.parse(startIso);
      if (!Number.isFinite(startTs)) return;

      const explicitEndIso = toIso(row?.end_at) || toIso(row?.endAt) || null;
      const explicitEndTs = explicitEndIso ? Date.parse(explicitEndIso) : NaN;
      const rowDurationRaw = Number.parseInt(
        String(row?.duration_minutes ?? row?.estimated_duration_minutes ?? row?.duration ?? row?.estimated_duration ?? "0"),
        10
      );

      let occupiedMinutes = Number.isFinite(rowDurationRaw) ? Math.max(0, Math.min(240, rowDurationRaw)) : 0;
      if (!occupiedMinutes && Number.isFinite(explicitEndTs) && explicitEndTs > startTs) {
        occupiedMinutes = Math.max(10, Math.round((explicitEndTs - startTs) / 60000));
      }
      if (!occupiedMinutes) occupiedMinutes = 10;

      occupiedRanges.push([startTs, startTs + occupiedMinutes * 60000]);
    });

    occupiedRanges.sort((a, b) => a[0] - b[0]);
    const merged = [];
    occupiedRanges.forEach(([start, end]) => {
      if (!merged.length) {
        merged.push([start, end]);
        return;
      }
      const last = merged[merged.length - 1];
      if (start <= last[1]) {
        last[1] = Math.max(last[1], end);
      } else {
        merged.push([start, end]);
      }
    });

    const suggestedTimes = [];
    const nowTs = Date.now();
    const isToday = date === new Date().toISOString().slice(0, 10);

    for (let minute = workStartMinutes; minute + requestedDuration <= workEndMinutes; minute += slotMinutes) {
      const hh = String(Math.floor(minute / 60)).padStart(2, "0");
      const mm = String(minute % 60).padStart(2, "0");
      const startTs = Date.parse(`${date}T${hh}:${mm}:00.000Z`);
      if (!Number.isFinite(startTs)) continue;
      if (isToday && startTs < nowTs) continue;

      const endTs = startTs + requestedDuration * 60000;
      const blocked = merged.some(([busyStart, busyEnd]) => startTs < busyEnd && endTs > busyStart);
      if (!blocked) suggestedTimes.push(`${hh}:${mm}`);
    }

    return res.json({ ok: true, date, chair: targetChair, duration_minutes: requestedDuration, suggestedTimes: suggestedTimes.slice(0, 24) });
  } catch (error) {
    console.error("[DOCTOR CHAIR AVAILABILITY] Error:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// POST /api/treatment/plans/:id/items - Create treatment plan item (legacy mobile compatibility)
app.post("/api/treatment/plans/:id/items", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const { doctorId } = v.decoded;
    const ownerCandidates = await resolveEncounterDoctorOwnerCandidates(v.decoded);
    const doctorKeys = [...new Set([String(doctorId || "").trim(), ...ownerCandidates].filter(Boolean))];
    const planId = String(req.params.id || "").trim();

    if (!planId) {
      return res.status(400).json({ ok: false, error: "plan_id_required" });
    }

    const {
      tooth_number,
      tooth_fdi_code,
      procedure_code,
      procedure_name,
      linked_icd10_code,
      status,
      chair_no,
      chairNo,
      chair,
      scheduled_at,
      scheduledAt,
      scheduled_date,
      due_date,
    } = req.body || {};

    const normalizedTooth = String(tooth_fdi_code || tooth_number || "").trim();
    const normalizedCode = String(procedure_code || "").trim();
    const normalizedName = String(procedure_name || normalizedCode || "Procedure").trim();

    if (!normalizedTooth || !normalizedCode) {
      return res.status(400).json({ ok: false, error: "missing_required_fields" });
    }

    const parseIso = (value) => {
      if (!value) return null;
      const raw = String(value).trim();
      if (!raw) return null;
      const ts = Date.parse(raw);
      if (!Number.isFinite(ts)) return null;
      return new Date(ts).toISOString();
    };

    const scheduledAtValue =
      parseIso(scheduled_at) ||
      parseIso(scheduledAt) ||
      parseIso(scheduled_date) ||
      parseIso(due_date) ||
      null;

    const { data: plan, error: planError } = await supabase
      .from("treatment_plans")
      .select("id, encounter_id, created_by_doctor_id")
      .eq("id", planId)
      .maybeSingle();

    if (!plan) {
      if (planError && !["22P02", "PGRST116"].includes(String(planError?.code || ""))) {
        console.error("[TREATMENT PLAN ITEM CREATE] plan lookup error:", planError);
        return res.status(500).json({ ok: false, error: "internal_error" });
      }
      return res.status(404).json({ ok: false, error: "plan_not_found" });
    }

    const hasEncounterAccess = await doctorHasAccessToEncounter(plan.encounter_id, v.decoded);
    if (!hasEncounterAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const chairValue = String(chair_no || chairNo || chair || "").trim() || null;
    const normalizedStatus = String(status || "planned").trim().toLowerCase();

    const basePayload = {
      treatment_plan_id: planId,
      tooth_fdi_code: normalizedTooth,
      procedure_code: normalizedCode,
      procedure_name: normalizedName,
      linked_icd10_code: linked_icd10_code || null,
      status: normalizedStatus,
      created_by_doctor_id: String(plan.created_by_doctor_id || doctorKeys[0] || doctorId),
      chair_no: chairValue,
      chair: chairValue,
    };

    const payloadCandidates = [
      {
        ...basePayload,
        procedure_description: normalizedName,
        scheduled_at: scheduledAtValue,
      },
      {
        ...basePayload,
        procedure_description: normalizedName,
        scheduled_date: scheduledAtValue,
      },
      {
        ...basePayload,
        procedure_name: normalizedName,
        scheduled_date: scheduledAtValue,
      },
      {
        ...basePayload,
        procedure_name: normalizedName,
      },
      {
        treatment_plan_id: planId,
        tooth_fdi_code: normalizedTooth,
        procedure_code: normalizedCode,
        procedure_name: normalizedName,
        created_by_doctor_id: String(plan.created_by_doctor_id || doctorKeys[0] || doctorId),
        status: normalizedStatus,
      },
    ];

    let item = null;
    let itemError = null;

    for (const payload of payloadCandidates) {
      const attempt = await supabase
        .from("treatment_items")
        .insert(payload)
        .select("id, treatment_plan_id, tooth_fdi_code, procedure_code, status, created_at")
        .single();

      if (!attempt.error && attempt.data) {
        item = attempt.data;
        itemError = null;
        break;
      }

      itemError = attempt.error;
      const code = String(attempt.error?.code || "");
      if (!["42703", "PGRST204", "PGRST205", "22P02", "23514", "23502"].includes(code)) {
        break;
      }
    }

    if (itemError || !item) {
      console.error("[TREATMENT PLAN ITEM CREATE] insert error:", itemError);
      return res.status(500).json({ ok: false, error: "item_create_failed", details: itemError?.message || null });
    }

    return res.json({
      id: item.id,
      treatment_plan_id: item.treatment_plan_id,
      tooth_number: item.tooth_fdi_code,
      procedure_code: item.procedure_code || normalizedCode,
      procedure_name: normalizedName,
      linked_icd10_code: linked_icd10_code || null,
      scheduled_at: scheduledAtValue || null,
      created_at: item.created_at || null,
      status: String(item.status || normalizedStatus).toLowerCase(),
    });
  } catch (error) {
    console.error("[TREATMENT PLAN ITEM CREATE] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

async function updateTreatmentItemStatusHandler(req, res) {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const itemId = String(req.params.id || "").trim();
    const requestedStatus = String(req.body?.status || "").trim().toUpperCase();

    if (!itemId) {
      return res.status(400).json({ ok: false, error: "item_id_required" });
    }

    if (!requestedStatus || !["DONE", "CANCELLED", "IN_PROGRESS", "PLANNED"].includes(requestedStatus)) {
      return res.status(400).json({ ok: false, error: "invalid_status" });
    }

    const { data: itemWithPlan, error: lookupError } = await supabase
      .from("treatment_items")
      .select(`
        id,
        treatment_plan_id,
        treatment_plans!inner(
          id,
          encounter_id,
          created_by_doctor_id
        )
      `)
      .eq("id", itemId)
      .maybeSingle();

    if (lookupError && !["22P02", "PGRST116"].includes(String(lookupError?.code || ""))) {
      console.error("[TREATMENT ITEM STATUS] lookup error:", lookupError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    if (!itemWithPlan) {
      return res.status(404).json({ ok: false, error: "item_not_found" });
    }

    const planEncounterId = itemWithPlan?.treatment_plans?.encounter_id;
    const hasEncounterAccess = await doctorHasAccessToEncounter(planEncounterId, v.decoded);
    if (!hasEncounterAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const statusCandidates = [requestedStatus.toLowerCase(), requestedStatus];
    let updatedItem = null;
    let updateError = null;

    for (const statusCandidate of statusCandidates) {
      const attempt = await supabase
        .from("treatment_items")
        .update({ status: statusCandidate })
        .eq("id", itemId)
        .select("id, treatment_plan_id, status")
        .single();

      if (!attempt.error && attempt.data) {
        updatedItem = attempt.data;
        updateError = null;
        break;
      }

      updateError = attempt.error;
      if (!["22P02", "23514", "PGRST204"].includes(String(attempt.error?.code || ""))) {
        break;
      }
    }

    if (updateError || !updatedItem) {
      console.error("[TREATMENT ITEM STATUS] update error:", updateError);
      return res.status(500).json({ ok: false, error: "status_update_failed", details: updateError?.message || null });
    }

    return res.json({
      ok: true,
      item: {
        id: updatedItem.id,
        treatment_plan_id: updatedItem.treatment_plan_id,
        status: String(updatedItem.status || requestedStatus).toUpperCase(),
      },
    });
  } catch (error) {
    console.error("[TREATMENT ITEM STATUS] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

app.put("/api/treatment/treatment-items/:id/status", updateTreatmentItemStatusHandler);
app.put("/api/treatment-items/:id/status", updateTreatmentItemStatusHandler);
app.patch("/api/treatment/treatment-items/:id/status", updateTreatmentItemStatusHandler);
app.patch("/api/treatment-items/:id/status", updateTreatmentItemStatusHandler);

app.put("/api/treatment/treatment-items/:id", async (req, res) => {
  try {
    const v = await verifyDoctorToken(req);
    if (!v.ok) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const itemId = String(req.params.id || "").trim();
    if (!itemId) {
      return res.status(400).json({ ok: false, error: "item_id_required" });
    }

    const {
      title,
      procedure_name,
      procedure_code,
      category,
      type,
      price,
      note,
      doctorId,
      doctor_id,
      chairNo,
      chair_no,
      chair,
      scheduledDate,
      scheduled_at,
      scheduled_date,
    } = req.body || {};

    const { data: itemWithPlan, error: lookupError } = await supabase
      .from("treatment_items")
      .select(`
        id,
        treatment_plan_id,
        treatment_plans!inner(
          id,
          encounter_id
        )
      `)
      .eq("id", itemId)
      .maybeSingle();

    if (lookupError && !["22P02", "PGRST116"].includes(String(lookupError?.code || ""))) {
      console.error("[TREATMENT ITEM UPDATE] lookup error:", lookupError);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }

    if (!itemWithPlan) {
      return res.status(404).json({ ok: false, error: "item_not_found" });
    }

    const planEncounterId = itemWithPlan?.treatment_plans?.encounter_id;
    const hasEncounterAccess = await doctorHasAccessToEncounter(planEncounterId, v.decoded);
    if (!hasEncounterAccess) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }

    const parseIso = (value) => {
      if (!value) return null;
      const raw = String(value).trim();
      if (!raw) return null;
      const ts = Date.parse(raw);
      if (!Number.isFinite(ts)) return null;
      return new Date(ts).toISOString();
    };

    const normalizedTitle = String(title || procedure_name || "").trim();
    const normalizedCode = String(procedure_code || "").trim();
    const normalizedCategory = String(category || "").trim() || null;
    const normalizedType = String(type || "").trim() || null;
    const normalizedNote = String(note || "").trim() || null;
    const normalizedDoctorId = String(doctorId || doctor_id || "").trim() || null;
    const normalizedChair = String(chairNo || chair_no || chair || "").trim() || null;
    const normalizedScheduledAt =
      parseIso(scheduled_at) ||
      parseIso(scheduled_date) ||
      parseIso(scheduledDate) ||
      null;

    const numericPrice =
      price === null || price === undefined || String(price).trim() === ""
        ? null
        : Number(price);
    const hasValidPrice = numericPrice === null || Number.isFinite(numericPrice);
    if (!hasValidPrice) {
      return res.status(400).json({ ok: false, error: "invalid_price" });
    }

    const missingColumnCodes = new Set(["42703", "PGRST204", "PGRST205"]);

    const tryColumnUpdate = async (columns, value) => {
      for (const column of columns) {
        const attempt = await supabase
          .from("treatment_items")
          .update({ [column]: value })
          .eq("id", itemId)
          .select("id")
          .maybeSingle();

        if (!attempt.error) {
          return true;
        }

        const code = String(attempt.error?.code || "");
        if (missingColumnCodes.has(code)) {
          continue;
        }

        console.error("[TREATMENT ITEM UPDATE] column update error:", {
          column,
          code,
          message: attempt.error?.message,
        });
        throw new Error("column_update_failed");
      }

      return false;
    };

    let updatedAnyField = false;

    if (normalizedTitle) {
      const ok = await tryColumnUpdate(["procedure_description", "procedure_name"], normalizedTitle);
      updatedAnyField = updatedAnyField || ok;
    }

    if (normalizedCode) {
      const ok = await tryColumnUpdate(["procedure_code", "procedure_id"], normalizedCode);
      updatedAnyField = updatedAnyField || ok;
    }

    if (category !== undefined) {
      const ok = await tryColumnUpdate(["category"], normalizedCategory);
      updatedAnyField = updatedAnyField || ok;
    }

    if (type !== undefined) {
      const ok = await tryColumnUpdate(["type"], normalizedType);
      updatedAnyField = updatedAnyField || ok;
    }

    if (price !== undefined) {
      const ok = await tryColumnUpdate(["price"], numericPrice);
      updatedAnyField = updatedAnyField || ok;
    }

    if (note !== undefined) {
      const ok = await tryColumnUpdate(["note", "notes"], normalizedNote);
      updatedAnyField = updatedAnyField || ok;
    }

    if (doctorId !== undefined || doctor_id !== undefined) {
      const ok = await tryColumnUpdate(["doctor_id", "created_by_doctor_id"], normalizedDoctorId);
      updatedAnyField = updatedAnyField || ok;
    }

    if (chairNo !== undefined || chair_no !== undefined || chair !== undefined) {
      const ok = await tryColumnUpdate(["chair_no", "chair"], normalizedChair);
      updatedAnyField = updatedAnyField || ok;
    }

    if (scheduledDate !== undefined || scheduled_at !== undefined || scheduled_date !== undefined) {
      const ok = await tryColumnUpdate(["scheduled_at", "scheduled_date", "due_date"], normalizedScheduledAt);
      updatedAnyField = updatedAnyField || ok;
    }

    if (!updatedAnyField) {
      return res.status(400).json({ ok: false, error: "no_updatable_fields" });
    }

    const itemSelectCandidates = [
      "id,treatment_plan_id,tooth_fdi_code,procedure_id,procedure_code,procedure_description,procedure_name,category,type,price,note,notes,doctor_id,created_by_doctor_id,chair_no,chair,scheduled_at,scheduled_date,due_date,status,updated_at",
      "id,treatment_plan_id,tooth_fdi_code,procedure_code,procedure_description,procedure_name,price,chair_no,chair,scheduled_at,scheduled_date,status,updated_at",
      "id,treatment_plan_id,tooth_fdi_code,procedure_code,procedure_name,status,updated_at",
    ];

    let updatedItem = null;
    let updatedItemError = null;

    for (const selectClause of itemSelectCandidates) {
      const fetchResult = await supabase
        .from("treatment_items")
        .select(selectClause)
        .eq("id", itemId)
        .maybeSingle();

      if (!fetchResult.error && fetchResult.data) {
        updatedItem = fetchResult.data;
        updatedItemError = null;
        break;
      }

      updatedItemError = fetchResult.error;
      const code = String(fetchResult.error?.code || "");
      if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
        break;
      }
    }

    if (!updatedItem) {
      if (updatedItemError) {
        console.error("[TREATMENT ITEM UPDATE] fetch updated item error:", updatedItemError);
      }
      return res.status(500).json({ ok: false, error: "item_update_failed" });
    }

    return res.json({ ok: true, item: updatedItem });
  } catch (error) {
    console.error("[TREATMENT ITEM UPDATE] exception:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// GET /api/treatment-plans/:id/items - Get treatment plan items
app.get("/api/treatment-plans/:id/items", async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log("[TREATMENT PLAN ITEMS] === DEBUG START ===");
    console.log("[TREATMENT PLAN ITEMS] Requested planId:", id);
    console.log("[TREATMENT PLAN ITEMS] Requested planId type:", typeof id);
    console.log("[TREATMENT PLAN ITEMS] Requested planId null?:", id === null);
    console.log("[TREATMENT PLAN ITEMS] Requested planId undefined?:", id === undefined);
    console.log("[TREATMENT PLAN ITEMS] Full req.params:", req.params);
    
    if (!id) {
      console.log("[TREATMENT PLAN ITEMS] ERROR: Plan ID missing");
      return res.status(400).json({ 
        ok: false, 
        error: "plan_id_required" 
      });
    }

    console.log("[TREATMENT PLAN ITEMS] Getting items for plan:", id);

    // Get treatment plan items with backward-compatible column fallback
    let items = null;
    let error = null;

    const selectCandidates = [
      `
        id,
        treatment_plan_id,
        tooth_fdi_code,
        procedure_id,
        procedure_code,
        procedure_description,
        category,
        type,
        price,
        scheduled_at,
        scheduled_date,
        due_date,
        status,
        created_at,
        updated_at
      `,
      `
        id,
        treatment_plan_id,
        tooth_fdi_code,
        procedure_code,
        procedure_name,
        procedure_description,
        scheduled_date,
        due_date,
        status,
        created_at,
        updated_at
      `,
      `
        id,
        treatment_plan_id,
        tooth_fdi_code,
        procedure_code,
        procedure_name,
        scheduled_date,
        due_date,
        status,
        created_at,
        updated_at
      `,
      `
        id,
        treatment_plan_id,
        tooth_fdi_code,
        procedure_code,
        procedure_name,
        status,
        created_at,
        updated_at
      `,
    ];

    for (const selectClause of selectCandidates) {
      const fetchResult = await supabase
        .from("treatment_items")
        .select(selectClause)
        .eq("treatment_plan_id", id)
        .order("tooth_fdi_code", { ascending: true });

      items = fetchResult.data;
      error = fetchResult.error;

      if (!error) {
        break;
      }

      const code = String(error.code || "");
      if (!["42703", "PGRST204", "PGRST205"].includes(code)) {
        break;
      }
    }

    if (!error && Array.isArray(items)) {
      items = items.map((item) => ({
        ...item,
        procedure_id: item.procedure_id ?? null,
        category: item.category ?? null,
        type: item.type ?? null,
        price: item.price ?? null,
        procedure_description: item.procedure_description || item.procedure_name || null,
      }));
    }

    const schemaCodes = new Set(["42703", "PGRST204", "PGRST205"]);

    const readItemsFromTable = async (tableName) => {
      for (const selectClause of selectCandidates) {
        const result = await supabase
          .from(tableName)
          .select(selectClause)
          .eq("treatment_plan_id", id)
          .order("created_at", { ascending: false });

        if (!result.error) {
          return { ok: true, items: Array.isArray(result.data) ? result.data : [] };
        }

        const code = String(result.error?.code || "");
        if (!schemaCodes.has(code)) {
          return { ok: false, hardError: result.error };
        }
      }

      return { ok: false, items: [] };
    };

    const primaryRead = await readItemsFromTable("treatment_items");
    const fallbackRead = await readItemsFromTable("treatment_plan_items");

    if (primaryRead.hardError) {
      console.error("[TREATMENT PLAN ITEMS] Database error:", primaryRead.hardError);
      return res.status(500).json({
        ok: false,
        error: "treatment_items_fetch_failed",
        details: primaryRead.hardError.message
      });
    }

    if (fallbackRead.hardError) {
      console.error("[TREATMENT PLAN ITEMS] Database error:", fallbackRead.hardError);
      return res.status(500).json({
        ok: false,
        error: "treatment_items_fetch_failed",
        details: fallbackRead.hardError.message
      });
    }

    items = [
      ...(Array.isArray(primaryRead.items) ? primaryRead.items : []),
      ...(Array.isArray(fallbackRead.items) ? fallbackRead.items : []),
    ];

    const seen = new Set();
    items = items
      .map((item) => ({
        ...item,
        tooth_fdi_code: item?.tooth_fdi_code || item?.tooth_number || null,
        procedure_description: item?.procedure_description || item?.procedure_name || null,
      }))
      .filter((row) => {
        const key = String(row?.id || [
          row?.treatment_plan_id,
          row?.tooth_fdi_code || "",
          row?.procedure_code || row?.procedure_name || row?.procedure_description || "",
          row?.status || "",
          row?.created_at || "",
        ].join("|"));
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    console.log("[TREATMENT PLAN ITEMS] Supabase data:", items);
    console.log("[TREATMENT PLAN ITEMS] Items length:", items?.length || 0);

    if (Array.isArray(items) && items.length > 0) {
      items = items.map((row) => {
        const itemId = String(row?.id || "").trim();
        if (!itemId) return row;
        const override = readTreatmentItemOverride(itemId);
        return applyTreatmentItemOverride(row, override);
      });
    }

    console.log("[TREATMENT PLAN ITEMS] Found items:", items?.length || 0);
    console.log("[TREATMENT PLAN ITEMS] === DEBUG END ===");

    return res.json({
      ok: true,
      data: items || []
    });

  } catch (err) {
    console.error("[TREATMENT PLAN ITEMS] Exception:", err);
    return res.status(500).json({
      ok: false,
      error: "internal_error"
    });
  }
});

// Global error handler for production safety
app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(500).json({
    ok: false,
    error: "internal_server_error",
    message: "Unexpected server error"
  });
});

// Force deployment - Mon Feb  9 17:09:05 +04 2026
// Force deployment - Mon Feb  9 17:31:41 +04 2026
// Fresh deployment - Mon Feb  9 21:21:31 +04 2026

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});