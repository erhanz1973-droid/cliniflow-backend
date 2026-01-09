console.log("### CLINIFLOW SERVER BOOT ###", new Date().toISOString());

// Load environment variables from .env file (for local development)
try {
  require("dotenv").config();
} catch (e) {
  // dotenv not installed, that's okay - use environment variables directly
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());

// Multer configuration for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(), // Store in memory, then upload to Supabase
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (Supabase Storage bucket limit ile uyumlu)
  },
  fileFilter: (req, file, cb) => {
    // İzin verilen dosya tipleri
    const allowedMimeTypes = [
      // Images
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/heic',
      'image/heif',
      // Documents
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword', // .doc (eski format)
      // Videos (opsiyonel)
      'video/mp4',
      'video/quicktime', // .mov
      // Medical images (opsiyonel)
      'application/dicom',
      'application/x-dicom',
      'image/dicom',
      // Archives (ZIP ve RAR izin veriliyor)
      'application/zip',
      'application/x-rar-compressed',
      'application/vnd.rar',
      'application/x-rar',
    ];

    // Yasak dosya tipleri (güvenlik)
    const forbiddenExtensions = [
      // Executables
      '.exe', '.app', '.deb', '.rpm', '.msi', '.dmg', '.pkg',
      '.bat', '.cmd', '.com', '.scr', '.vbs', '.ps1',
      // Scripts
      '.js', '.jsx', '.ts', '.tsx', '.py', '.pyc', '.pyo',
      '.sh', '.bash', '.zsh', '.csh', '.fish',
      '.php', '.asp', '.aspx', '.jsp', '.rb', '.pl', '.pm',
      // Archives with potential executables (ZIP ve RAR hariç - kullanıcı istedi)
      '.7z', '.tar', '.gz', '.bz2',
      // System files
      '.dll', '.so', '.dylib', '.sys', '.drv',
    ];

    const fileExt = path.extname(file.originalname || '').toLowerCase();
    const mimeType = file.mimetype || '';

    // Check forbidden extensions
    if (forbiddenExtensions.includes(fileExt)) {
      console.error(`[Upload] Forbidden file extension: ${fileExt}`);
      return cb(new Error(`Dosya tipi yasak: ${fileExt}. Güvenlik nedeniyle bu dosya tipi yüklenemez.`));
    }

    // Check allowed MIME types
    if (!allowedMimeTypes.includes(mimeType)) {
      // Special case: DICOM files might have various MIME types
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

/* ================= JWT SECRET ================= */
const JWT_SECRET = process.env.JWT_SECRET || "cliniflow-secret-key-change-in-production";

/* ================= PATHS ================= */
const DATA_DIR = path.join(__dirname, "data");
const PATIENTS_DIR = path.join(DATA_DIR, "patients");
const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
const TRAVEL_DIR = path.join(DATA_DIR, "travel");

const PUBLIC_DIR = path.join(__dirname, "public");

// admin.html ve admin-travel.html route'larını static serving'den önce tanımla
app.get("/admin.html", (req, res) => {
  const filePath = path.join(__dirname, "admin.html");
  if (!fs.existsSync(filePath)) return res.status(404).send("admin.html not found");
  res.sendFile(filePath);
});

app.get("/admin-travel.html", (req, res) => {
  // Next.js travel sayfasını iframe içinde gösteren wrapper sayfa
  const filePath = path.join(PUBLIC_DIR, "admin-travel.html");
  if (!fs.existsSync(filePath)) {
    return res.status(404).send(`
      <html>
        <head><title>Admin Travel - Not Found</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h1>Admin Travel Sayfası Bulunamadı</h1>
          <p>admin-travel.html dosyası bulunamadı.</p>
          <p><a href="http://localhost:3000/admin/patients">Next.js Admin Panelini Kullanın</a></p>
        </body>
      </html>
    `);
  }
  res.sendFile(filePath);
});

app.use(express.static(PUBLIC_DIR));

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
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .single();

    if (patientError || !patientData) {
      console.error("Treatments GET - Patient not found:", patientError);
      // Fallback: Boş treatments data döndür
      const fallback = {
        schemaVersion: 1,
        updatedAt: now(),
        patientId,
        teeth: [],
      };
      return res.json(fallback);
    }

    const patientUuid = patientData.id;

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
  } catch (error) {
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
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .single();

    if (patientError || !patientData) {
      console.error("Treatments POST - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const patientUuid = patientData.id;

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
  } catch (error) {
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
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .single();

    if (patientError || !patientData) {
      console.error("Treatments DELETE - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const patientUuid = patientData.id;

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
  } catch (error) {
    console.error("Treatments DELETE - Exception:", error);
    res.status(500).json({ ok: false, error: "treatments_delete_exception", details: error.message });
  }
});

/* ================= TRAVEL (GET) ================= */
app.get("/api/patient/:patientId/travel", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  try {
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .single();

    if (patientError || !patientData) {
      console.error("Travel GET - Patient not found:", patientError);
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

    const patientUuid = patientData.id;
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
    const result = {
      ...travelJson,
      schemaVersion: travelData.schema_version || 1,
      updatedAt: travelData.updated_at ? new Date(travelData.updated_at).getTime() : now(),
      patientId,
      // Eksik alanları fallback ile tamamla
      hotel: travelJson.hotel || null,
      flights: Array.isArray(travelJson.flights) ? travelJson.flights : [],
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

    res.json(result);
  } catch (error) {
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

  try {
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .single();

    if (patientError || !patientData) {
      console.error("Travel SAVE - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
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

  // 🔒 Admin kilitlediyse hasta yazamasın
  if (current.lockedByAdmin && actor !== "admin") {
    return res.status(403).json({
      ok: false,
      error: "travel_locked_by_admin",
    });
  }

    // 🧠 MERGE-SAFE - Tüm alanları birleştir
  const next = {
    ...current,
    updatedAt: now(),
      patientId,
      // Hotel
    hotel: body.hotel !== undefined ? body.hotel : current.hotel,
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

    console.log("Travel SAVE - Success:", {
      patientId,
      patientUuid,
      savedPatientUuid: savedData.patient_id,
      hasAirportPickup: !!next.airportPickup,
      airportPickupData: next.airportPickup,
    });

    res.json({ ok: true, saved: true, travel: next });
  } catch (error) {
    console.error("Travel SAVE - Exception:", error);
    res.status(500).json({ ok: false, error: "travel_save_exception", details: error.message });
  }
}

app.post("/api/patient/:patientId/travel", saveTravel);
app.put("/api/patient/:patientId/travel", saveTravel);

/* ================= ADMIN TRAVEL LOCK ================= */
app.post("/api/admin/patient/:patientId/travel-lock", (req, res) => {
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
function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[AUTH] Missing or invalid Authorization header");
    return res.status(401).json({ ok: false, error: "missing_token" });
  }

  const token = authHeader.substring(7);
  console.log("[AUTH] Verifying token, length:", token.length);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("[AUTH] Token decoded successfully:", { 
      clinicId: decoded.clinicId, 
      clinicCode: decoded.clinicCode 
    });
    
    if (!decoded.clinicId || !decoded.clinicCode) {
      console.error("[AUTH] Token missing clinicId or clinicCode");
      return res.status(401).json({ ok: false, error: "invalid_token_format" });
    }
    
    req.clinicId = decoded.clinicId;
    req.clinicCode = decoded.clinicCode;
    next();
  } catch (error) {
    console.error("[AUTH] Token verification failed:", error.message);
    return res.status(401).json({ ok: false, error: "invalid_token", details: error.message });
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
    
    const clinicType = String(requestClinicType || "DENTAL").trim().toUpperCase();
    console.log("[REGISTER] After String() conversion:", clinicType);
    
    const validClinicTypes = ["DENTAL", "HAIR"];
    const finalClinicType = validClinicTypes.includes(clinicType) ? clinicType : "DENTAL";
    
    console.log("[REGISTER] Final clinicType:", finalClinicType);
    console.log("[REGISTER] Was requestClinicType valid?", validClinicTypes.includes(clinicType));
    
    // Default enabled modules based on clinic type
    let defaultModules = [];
    if (finalClinicType === "DENTAL") {
      defaultModules = ["UPLOADS", "TRAVEL", "REFERRALS", "CHAT", "PATIENTS", "DENTAL_TREATMENTS", "DENTAL_TEETH_CHART"];
    } else if (finalClinicType === "HAIR") {
      defaultModules = ["UPLOADS", "TRAVEL", "REFERRALS", "CHAT", "PATIENTS", "HAIR_GRAFTS", "HAIR_SCALP", "HAIR_CHECKLISTS", "HAIR_PHOTO_TIMELINE"];
    }
    
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
    
    const { data: newClinic, error } = await supabase
      .from("clinics")
      .insert(insertData)
      .select()
      .single();

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
        details: error.message || "Unknown database error"
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
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", async (req, res) => {
  try {
    const { clinicCode, password } = req.body || {};

    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }

    if (!password || !String(password).trim()) {
      return res.status(400).json({ ok: false, error: "password_required" });
    }

    const trimmedClinicCode = String(clinicCode).trim().toUpperCase();

    // Klinik bul
    const { data: clinic, error } = await supabase
      .from("clinics")
      .select("*")
      .eq("clinic_code", trimmedClinicCode)
      .single();

    if (error || !clinic) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
    }

    // Şifre kontrolü
    const passwordMatch = await bcrypt.compare(String(password).trim(), clinic.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ ok: false, error: "invalid_clinic_code_or_password" });
    }

    // JWT token oluştur
    const token = jwt.sign(
      { clinicId: clinic.id, clinicCode: trimmedClinicCode },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      ok: true,
      token,
      clinicCode: trimmedClinicCode,
      clinicName: clinic.name || "Clinic",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
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
  } catch (error) {
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
  } catch (error) {
    console.error("Public clinic GET (query) error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN CLINIC (GET) ================= */
app.get("/api/admin/clinic", verifyAdminToken, async (req, res) => {
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
      },
      updatedAt: clinic.updated_at ? new Date(clinic.updated_at).getTime() : null,
    });
  } catch (error) {
    console.error("Get clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN CLINIC (PUT) ================= */
app.put("/api/admin/clinic", verifyAdminToken, async (req, res) => {
  try {
    const body = req.body || {};
    console.log("[UPDATE CLINIC] Received body:", JSON.stringify(body, null, 2));
    console.log("[UPDATE CLINIC] Clinic ID:", req.clinicId);

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
    
    // Add clinicType and enabledModules if provided
    if (body.clinicType) {
      const validTypes = ["DENTAL", "HAIR"];
      if (validTypes.includes(String(body.clinicType).toUpperCase())) {
        updateData.clinic_type = String(body.clinicType).toUpperCase();
      }
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
    
    // Add branding if provided (only allowed for Pro plan)
    if (body.branding && typeof body.branding === "object") {
      // Get current plan to check if branding is allowed
      const { data: currentClinic } = await supabase
        .from("clinics")
        .select("plan")
        .eq("id", req.clinicId)
        .single();
      
      const currentPlan = currentClinic?.plan || updateData.plan || "FREE";
      
      // Only allow branding customization for Pro plan
      if (currentPlan === "PRO" || updateData.plan === "PRO") {
        const branding = {
          title: body.branding.title || "",
          logoUrl: body.branding.logoUrl || "",
          showPoweredBy: body.branding.showPoweredBy !== undefined ? body.branding.showPoweredBy : false,
        };
        updateData.branding = branding;
        // Also update logo_url if branding.logoUrl is provided (for backward compatibility)
        if (body.branding.logoUrl !== undefined) {
          updateData.logo_url = body.branding.logoUrl;
        }
      } else {
        // For Free/Basic, enforce standard branding
        updateData.branding = {
          title: "",
          logoUrl: "",
          showPoweredBy: true,
        };
      }
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
    const plan = updatedClinic.plan || "FREE";
    
    // Calculate maxPatients based on plan if not set in database
    // Free: 3, Basic: 10, Pro: unlimited (null)
    let maxPatients = updatedClinic.max_patients;
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
    const branding = updatedClinic.branding || {};
    const isPro = plan === "PRO";
    const brandingTitle = isPro ? (branding.title || updatedClinic.name || "") : "";
    const brandingLogoUrl = isPro ? (branding.logoUrl || updatedClinic.logo_url || "") : "";
    const showPoweredBy = !isPro; // Free and Basic always show "Powered by Clinicator"

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
        plan: plan,
        maxPatients: maxPatients,
        currentPatientCount: currentPatientCount,
        branding: {
          title: brandingTitle,
          logoUrl: brandingLogoUrl,
          showPoweredBy: showPoweredBy,
        },
        updatedAt: updatedClinic.updated_at ? new Date(updatedClinic.updated_at).getTime() : null,
      },
    });
  } catch (error) {
    console.error("Update clinic error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENTS (GET) ================= */
app.get("/api/admin/patients", verifyAdminToken, async (req, res) => {
  try {
    // Tüm hastaları getir (hem PENDING hem APPROVED)
    const { data: patients, error } = await supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", req.clinicId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get patients error:", error);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_patients" });
    }

    const list = (patients || []).map((p) => ({
      requestId: p.patient_id, // Backward compatibility
      patientId: p.patient_id,
      referralCode: p.referral_code || null,
      name: p.name || "",
      phone: p.phone || "",
      status: p.status,
      createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
      updatedAt: p.updated_at ? new Date(p.updated_at).getTime() : Date.now(),
      treatmentStartDate: p.treatment_start_date ? new Date(p.treatment_start_date).getTime() : null,
    }));

    res.json({ ok: true, list });
  } catch (error) {
    console.error("Get patients error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN PATIENTS (POST - Create Patient) ================= */
app.post("/api/admin/patients", verifyAdminToken, async (req, res) => {
  try {
    const { name, phone } = req.body || {};

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required", message: "Phone number is required" });
    }

    // Get clinic info (plan and maxPatients)
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, clinic_code, plan, max_patients")
      .eq("id", req.clinicId)
      .single();

    if (clinicError || !clinic) {
      console.error("[ADMIN CREATE PATIENT] Clinic lookup error:", clinicError);
      return res.status(404).json({ ok: false, error: "clinic_not_found" });
    }

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

    res.json({
      ok: true,
      patientId: newPatient.patient_id,
      referralCode: newPatient.referral_code || newPatient.patient_id,
      name: newPatient.name || "",
      phone: newPatient.phone || "",
      status: newPatient.status,
      createdAt: newPatient.created_at ? new Date(newPatient.created_at).getTime() : Date.now(),
    });
  } catch (error) {
    console.error("[ADMIN CREATE PATIENT] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error", details: error?.message });
  }
});

/* ================= PATIENT REGISTER ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { name, phone, clinicCode, referralCode: inviterReferralCode } = req.body || {};

    if (!clinicCode || !String(clinicCode).trim()) {
      return res.status(400).json({ ok: false, error: "clinic_code_required" });
    }

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required" });
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

    console.log(`[REGISTER] Clinic found: ${clinic.name} (${clinic.clinic_code}), ID: ${clinic.id}`);

    // 5 haneli patient ID ve referral code oluştur (aynı kod)
    async function generatePatientCode() {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // I, O, 0, 1 harfleri karışıklık yaratmaması için çıkarıldı
      let attempts = 0;
      const maxAttempts = 100;
      
      while (attempts < maxAttempts) {
        let code = "";
        for (let i = 0; i < 5; i++) {
          code += chars[Math.floor(Math.random() * chars.length)];
        }
        
        // Unique kontrolü (hem patient_id hem referral_code için)
        const { data: existingById } = await supabase
          .from("patients")
          .select("patient_id")
          .eq("patient_id", code)
          .maybeSingle();
        
        // Referral code kontrolü (eğer kolon varsa)
        let existingByCode = null;
        try {
          const { data } = await supabase
            .from("patients")
            .select("referral_code")
            .eq("referral_code", code)
            .maybeSingle();
          existingByCode = data;
        } catch (err) {
          // referral_code kolonu yoksa bu hatayı görmezden gel
          console.warn("[REGISTER] referral_code column may not exist yet, skipping check:", err?.message);
        }
        
        if (!existingById && !existingByCode) {
          return code; // Unique code bulundu
        }
        attempts++;
      }
      
      // Fallback: timestamp + random (5 haneli)
      const fallbackCode = Date.now().toString().slice(-5);
      return fallbackCode.padStart(5, '0');
    }
    
    const patientCode = await generatePatientCode();
    const nextPatientId = patientCode; // Patient ID = Referral Code (5 haneli)
    const referralCode = patientCode; // Referral Code = Patient ID (aynı kod)
    console.log(`[REGISTER] Generated patient ID and referral code: ${patientCode}`);

    // Hasta kaydı oluştur (patient_id = referral_code = 5 haneli kod)
    // referral_code kolonu varsa ekle, yoksa sadece patient_id kullan
    let newPatient;
    let patientError;
    
    // Önce referral_code ile dene
    const { data: patientWithCode, error: errorWithCode } = await supabase
      .from("patients")
      .insert({
        clinic_id: clinic.id,
        patient_id: nextPatientId, // 5 haneli kod
        referral_code: referralCode, // 5 haneli kod (patient ID ile aynı)
        name: name || "",
        phone: String(phone).trim(),
        status: "PENDING",
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
          patient_id: nextPatientId, // 5 haneli kod
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
        .select("id, patient_id, name, clinic_id")
        .eq("patient_id", trimmedReferralCode)
        .eq("clinic_id", clinic.id)
        .maybeSingle();
      
      console.log(`[REGISTER] Search by patient_id result:`, {
        found: !!inviterById,
        error: errorById?.message,
        patientId: inviterById?.patient_id,
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
          .select("patient_id, name")
          .eq("clinic_id", clinic.id)
          .limit(20);
        
        if (!allError && allPatients) {
          console.log(`[REGISTER] Available patient IDs (referral codes) in clinic ${clinic.clinic_code}:`, 
            allPatients.map(p => ({
              patientId: p.patient_id,
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
          status: "PENDING", // Explicitly set to PENDING
        };
        
        console.log(`[REGISTER] Creating referral record:`, {
          referralId,
          clinicId: clinic.id,
          inviterPatientId: inviterPatient.patient_id,
          invitedPatientId: newPatient.patient_id,
          status: "PENDING",
        });
        
        const { data: createdReferral, error: referralError } = await supabase
          .from("referrals")
          .insert(referralData)
          .select()
          .single();
        
        if (referralError) {
          console.error("[REGISTER] Failed to create referral record:", referralError);
          console.error("[REGISTER] Referral data:", referralData);
          // Referral kaydı oluşturulamadı ama hasta kaydı başarılı, devam et
        } else {
          console.log(`[REGISTER] Referral record created successfully:`, {
            referralId: createdReferral.referral_id || createdReferral.id,
            status: createdReferral.status || "NULL",
            inviter: inviterPatient.patient_id,
            invited: newPatient.patient_id,
          });
        }
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
        patientId: newPatient.patient_id, 
        clinicId: clinic.id,
        clinicCode: trimmedClinicCode,
        role: "patient"
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      ok: true,
      token: patientToken, // Frontend token bekliyor
      patientId: newPatient.patient_id,
      referralCode: newPatient.referral_code || null,
      requestId: newPatient.patient_id, // Backward compatibility
      name: newPatient.name || "",
      phone: newPatient.phone || "",
      status: newPatient.status,
    });
  } catch (error) {
    console.error("[REGISTER] Unexpected error:", error);
    res.status(500).json({ 
      ok: false, 
      error: "internal_error",
      message: error?.message || "Unknown error occurred"
    });
  }
});

/* ================= ADMIN APPROVE ================= */
app.post("/api/admin/approve", verifyAdminToken, async (req, res) => {
  try {
    const { requestId, patientId } = req.body || {};

    if (!requestId && !patientId) {
      return res.status(400).json({ ok: false, error: "requestId_or_patientId_required" });
    }

    const targetPatientId = patientId || requestId;
    const trimmedPatientId = String(targetPatientId).trim();

    // Hasta bul (sadece bu klinik için)
    const { data: patient, error: findError } = await supabase
      .from("patients")
      .select("*")
      .eq("clinic_id", req.clinicId)
      .eq("patient_id", trimmedPatientId)
      .single();

    if (findError || !patient) {
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
      console.error("Approve patient error:", updateError);
      return res.status(500).json({ ok: false, error: "approval_failed" });
    }

    res.json({
      ok: true,
      patientId: updatedPatient.patient_id,
      status: updatedPatient.status,
      message: "Patient approved successfully",
    });
  } catch (error) {
    console.error("Approve error:", error);
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
        .select("*")
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

      const response = {
        ok: true,
        patientId: patient.patient_id,
        referralCode: patient.referral_code || null,
        name: patient.name || "",
        phone: patient.phone || "",
        status: patient.status || "PENDING",
        clinicCode: decoded.clinicCode || null,
        createdAt: patient.created_at ? new Date(patient.created_at).getTime() : null,
      };
      
      console.log("[PATIENT ME] Response:", JSON.stringify(response, null, 2));
      console.log("[PATIENT ME] Decoded clinicCode:", decoded.clinicCode);
      res.json(response);
    } catch (jwtError) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  } catch (error) {
    console.error("Patient me error:", error);
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
  } catch (error) {
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
  } catch (error) {
    // Analytics hataları sessizce handle et
    console.error("[EVENTS] Error:", error);
    res.json({ ok: true, received: true }); // Her zaman success dön
  }
});

/* ================= PATIENT MESSAGES (GET) ================= */
// Hasta mesajlarını getir
app.get("/api/patient/:patientId/messages", async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  try {
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .single();

    if (patientError || !patientData) {
      console.log("Messages GET - Patient not found:", patientError?.message);
      return res.json({ ok: true, messages: [] }); // Boş mesaj listesi döndür (404 yerine)
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
  } catch (error) {
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
  } catch (error) {
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

    // 4. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", clinicId) // Aynı clinic'ten olmalı
      .single();

    if (patientError || !patientData) {
      console.error("Messages POST - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const patientUuid = patientData.id;

    // 5. Mesaj oluştur
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

    console.log("Messages POST - Success:", { patientId, messageId });
    res.json(response);
  } catch (error) {
    console.error("Messages POST error:", error);
    res.status(500).json({ ok: false, error: "message_send_exception", details: error.message });
  }
});

/* ================= PATIENT MESSAGES (POST - Admin Reply) ================= */
// Admin mesaj gönder
app.post("/api/patient/:patientId/messages/admin", verifyAdminToken, async (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

  const body = req.body || {};
  const text = String(body.text || "").trim();
  
  if (!text) {
    return res.status(400).json({ ok: false, error: "text_required" });
  }

  try {
    // 1. Önce patient_id (TEXT) ile patient'ı bul, UUID'sini al
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("patient_id", patientId)
      .eq("clinic_id", req.clinicId) // Aynı clinic'ten olmalı
      .single();

    if (patientError || !patientData) {
      console.error("Messages POST - Patient not found:", patientError);
      return res.status(404).json({ ok: false, error: "patient_not_found" });
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
        text: text,
        type: "text",
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
        text: newMessage.text,
        type: newMessage.type,
        createdAt: newMessage.created_at ? new Date(newMessage.created_at).getTime() : Date.now(),
      },
    };

    console.log("Messages POST - Success:", { patientId, messageId });
    res.json(response);
  } catch (error) {
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
  } catch (error) {
    console.error("Patient Referrals GET error:", error);
    res.status(500).json({ ok: false, error: "referrals_fetch_exception", details: error.message });
  }
});

/* ================= ADMIN REFERRALS (GET) ================= */
app.get("/api/admin/referrals", verifyAdminToken, async (req, res) => {
  try {
    const status = String(req.query.status || "").trim().toUpperCase();
    console.log(`[ADMIN REFERRALS] Fetching referrals for clinic_id: ${req.clinicId}, status filter: ${status || "ALL"}`);
    
    // Önce tüm referral'ları çek (debug için)
    const { data: allReferrals, error: allError } = await supabase
      .from("referrals")
      .select("*")
      .eq("clinic_id", req.clinicId)
      .order("created_at", { ascending: false });
    
    if (allError) {
      console.error("[ADMIN REFERRALS] Supabase error (all):", allError);
    } else {
      console.log(`[ADMIN REFERRALS] Total referrals in DB: ${allReferrals?.length || 0}`);
      if (allReferrals && allReferrals.length > 0) {
        console.log(`[ADMIN REFERRALS] Status breakdown:`, {
          PENDING: allReferrals.filter(r => (r.status || "").toUpperCase() === "PENDING").length,
          APPROVED: allReferrals.filter(r => (r.status || "").toUpperCase() === "APPROVED").length,
          REJECTED: allReferrals.filter(r => (r.status || "").toUpperCase() === "REJECTED").length,
          NULL: allReferrals.filter(r => !r.status).length,
        });
        // İlk birkaç referral'ın detaylarını logla
        allReferrals.slice(0, 3).forEach((r, i) => {
          console.log(`[ADMIN REFERRALS] Referral ${i + 1}:`, {
            id: r.referral_id || r.id,
            status: r.status || "NULL",
            inviter: r.inviter_patient_name || r.inviter_patient_id,
            invited: r.invited_patient_name || r.invited_patient_id,
          });
        });
      }
    }
    
    let query = supabase
      .from("referrals")
      .select("*")
      .eq("clinic_id", req.clinicId);

    // Status filter uygula
    if (status && ["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      if (status === "PENDING") {
        // PENDING için: status = 'PENDING' VEYA status IS NULL
        // Önce tüm referral'ları çek, sonra JavaScript'te filtrele
        // Çünkü Supabase'de OR query karmaşık olabilir
        console.log(`[ADMIN REFERRALS] PENDING filter: Will filter in JavaScript after fetch`);
      } else {
        query = query.eq("status", status);
      }
    }

    const { data: referrals, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN REFERRALS] Supabase error:", error);
      return res.status(500).json({ ok: false, error: "referrals_fetch_failed", details: error.message });
    }
    
    // PENDING filter için JavaScript'te filtrele
    let filteredReferrals = referrals || [];
    if (status === "PENDING") {
      console.log(`[ADMIN REFERRALS] Before PENDING filter: ${referrals?.length || 0} referrals`);
      if (referrals && referrals.length > 0) {
        console.log(`[ADMIN REFERRALS] Referral statuses:`, referrals.map(r => ({
          id: r.referral_id || r.id,
          status: r.status || "NULL",
          statusType: typeof r.status,
        })));
      }
      
      filteredReferrals = (referrals || []).filter(ref => {
        const refStatus = ref.status ? String(ref.status).toUpperCase().trim() : "";
        const isPending = refStatus === "PENDING" || refStatus === "" || !ref.status || ref.status === null || ref.status === undefined;
        if (isPending) {
          console.log(`[ADMIN REFERRALS] Found PENDING referral:`, {
            id: ref.referral_id || ref.id,
            status: ref.status || "NULL",
            isPending: true,
          });
        }
        return isPending;
      });
      
      console.log(`[ADMIN REFERRALS] PENDING filter: ${referrals?.length || 0} total, ${filteredReferrals.length} after filter`);
      if (filteredReferrals.length > 0) {
        console.log(`[ADMIN REFERRALS] PENDING referrals:`, filteredReferrals.map(r => ({
          id: r.referral_id || r.id,
          status: r.status || "NULL",
          inviter: r.inviter_patient_name || r.inviter_patient_id,
          invited: r.invited_patient_name || r.invited_patient_id,
        })));
      } else {
        console.log(`[ADMIN REFERRALS] No PENDING referrals found after filter`);
      }
    }
    
    // Status NULL olan referral'ları PENDING olarak işaretle
    filteredReferrals.forEach(ref => {
      if (!ref.status || ref.status === null || ref.status === undefined) {
        ref.status = "PENDING";
        console.log(`[ADMIN REFERRALS] Set NULL status to PENDING for referral:`, ref.referral_id || ref.id);
      }
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
          .select("patient_id, name")
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
          .select("patient_id, name")
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
  } catch (error) {
    console.error("[ADMIN REFERRALS] Exception:", error);
    res.status(500).json({ ok: false, error: "referrals_fetch_exception", details: error.message });
  }
});

/* ================= ADMIN REFERRAL APPROVE ================= */
app.patch("/api/admin/referrals/:referralId/approve", verifyAdminToken, async (req, res) => {
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
      .eq("referral_id", referralId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (findError || !referral) {
      console.error("[ADMIN REFERRAL APPROVE] Referral not found:", findError);
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }

    // Referral'ı güncelle
    const updateData = {
      status: "APPROVED",
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
      .eq("referral_id", referralId)
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
  } catch (error) {
    console.error("[ADMIN REFERRAL APPROVE] Exception:", error);
    res.status(500).json({ ok: false, error: "approval_exception", details: error.message });
  }
});

/* ================= ADMIN REFERRAL REJECT ================= */
app.patch("/api/admin/referrals/:referralId/reject", verifyAdminToken, async (req, res) => {
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
      .eq("referral_id", referralId)
      .eq("clinic_id", req.clinicId)
      .single();

    if (findError || !referral) {
      console.error("[ADMIN REFERRAL REJECT] Referral not found:", findError);
      return res.status(404).json({ ok: false, error: "referral_not_found" });
    }

    // Referral'ı REJECTED olarak güncelle
    const { data: updatedReferral, error: updateError } = await supabase
      .from("referrals")
      .update({
        status: "REJECTED",
        approved_at: null, // Approve date'i temizle
      })
      .eq("referral_id", referralId)
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
  } catch (error) {
    console.error("[ADMIN REFERRAL REJECT] Exception:", error);
    res.status(500).json({ ok: false, error: "rejection_exception", details: error.message });
  }
});

/* ================= HEALTH ================= */
app.get("/health", (req, res) => {
  res.json({ ok: true, port: String(PORT) });
});

/* ================= HAIR TRANSPLANT MODULE ================= */

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

/* ================= HAIR ZONES (GET) ================= */
// Get all zones for a patient
app.get("/api/hair/zones/:patientId", verifyAdminToken, async (req, res) => {
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
  } catch (error) {
    console.error("[HAIR ZONES GET] Exception:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= HAIR ZONES (POST/PUT) ================= */
// Create or update a zone
app.post("/api/hair/zones/:patientId", verifyAdminToken, async (req, res) => {
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
  } catch (error) {
    console.error("[HAIR ZONES POST] Exception:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= HAIR GRAFTS SUMMARY ================= */
// Get graft planning summary for a patient
app.get("/api/hair/summary/:patientId", verifyAdminToken, async (req, res) => {
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
  } catch (error) {
    console.error("[HAIR SUMMARY GET] Exception:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= HAIR DONOR ZONES ================= */
// Get donor zone information
app.get("/api/hair/donor/:patientId", verifyAdminToken, async (req, res) => {
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
  } catch (error) {
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
  } catch (error) {
    console.error("[updateHairGraftsSummary] Error:", error);
  }
}

/* ================= START ================= */
app.listen(PORT, "0.0.0.0", () => {
  ensureDirs();
  console.log(`✅ Server running: http://127.0.0.1:${PORT}`);
  console.log(`🔧 Admin:        http://127.0.0.1:${PORT}/admin.html`);
  console.log(`📁 Data dir:     ${DATA_DIR}`);
  console.log(`💡 Next.js Admin Travel: http://localhost:3000/admin/patients/[patientId]/travel`);
});
