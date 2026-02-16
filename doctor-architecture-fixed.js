// DOCTOR APPLICATION ARCHITECTURE - FIXED VERSION
// Bu dosya doğru mimariyi implemente eder

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ================= MIDDLEWARE =================

// Role kontrol middleware'i
function requireRole(requiredRole) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing_token" });
    }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (!decoded.role || decoded.role !== requiredRole) {
        return res.status(403).json({ 
          ok: false, 
          error: "insufficient_permissions" 
        });
      }

      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ ok: false, error: "invalid_token" });
    }
  };
}

// Admin middleware (mevcut adminAuth kullanılabilir)
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "missing_token" });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.role || decoded.role !== "ADMIN") {
      return res.status(403).json({ 
        ok: false, 
        error: "admin_required" 
        });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "invalid_token" });
  }
}

// ================= DOCTOR REGISTRATION =================

// 1️⃣ Doctor başvurusu - users + doctor_applications
router.post("/register", async (req, res) => {
  try {
    const { 
      email, 
      password, 
      fullName, 
      phone, 
      licenseNumber, 
      specialty, 
      clinicName 
    } = req.body;

    if (!email || !password || !fullName || !licenseNumber || !clinicName) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_required_fields" 
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Transaction başlat
    const { data: user, error: userError } = await supabase
      .from("users")
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        phone,
        role: "PATIENT" // Başvuru sırasında PATIENT
      })
      .select()
      .single();

    if (userError) {
      console.error("[DOCTOR REGISTER] User creation error:", userError);
      return res.status(500).json({ ok: false, error: "user_creation_failed" });
    }

    // Doctor başvurusunu oluştur
    const { data: application, error: appError } = await supabase
      .from("doctor_applications")
      .insert({
        user_id: user.id,
        clinic_name: clinicName,
        specialty: specialty,
        license_number: licenseNumber,
        status: "PENDING"
      })
      .select()
      .single();

    if (appError) {
      console.error("[DOCTOR REGISTER] Application creation error:", appError);
      return res.status(500).json({ ok: false, error: "application_creation_failed" });
    }

    console.log("[DOCTOR REGISTER] Application created:", { 
      userId: user.id, 
      email: email,
      applicationId: application.id 
    });

    res.json({
      ok: true,
      message: "Doctor application submitted successfully",
      userId: user.id,
      applicationId: application.id,
      status: "PENDING"
    });

  } catch (error) {
    console.error("[DOCTOR REGISTER] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= ADMIN DOCTOR APPLICATIONS =================

// 2️⃣ Doctor başvurularını listele
router.get("/applications", requireAdminAuth, async (req, res) => {
  try {
    const { data: applications, error } = await supabase
      .from("doctor_applications")
      .select(`
        *,
        users!inner(
          email,
          phone,
          created_at
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[DOCTOR APPLICATIONS] Fetch error:", error);
      return res.status(500).json({ ok: false, error: "fetch_failed" });
    }

    res.json({
      ok: true,
      data: applications || []
    });

  } catch (error) {
    console.error("[DOCTOR APPLICATIONS] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// 3️⃣ Doctor başvurusunu onayla - DOĞRU YÖNTEM
router.post("/applications/:id/approve", requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const clinicId = req.admin?.clinicId;

    if (!id || !clinicId) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_required_fields" 
      });
    }

    console.log("[DOCTOR APPROVE] Approving application:", { id, clinicId });

    // Transaction içinde tüm işlemleri yap
    const { error: approveError } = await supabase.rpc('approve_doctor_application', {
      application_id: id,
      clinic_id: clinicId
    });

    if (approveError) {
      console.error("[DOCTOR APPROVE] Transaction error:", approveError);
      return res.status(500).json({ ok: false, error: "approval_failed" });
    }

    console.log("[DOCTOR APPROVE] Application approved successfully:", id);

    res.json({
      ok: true,
      message: "Doctor application approved successfully",
      applicationId: id
    });

  } catch (error) {
    console.error("[DOCTOR APPROVE] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= DOCTOR LOGIN =================

// 4️⃣ Doctor login - role kontrolü ile
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        ok: false, 
        error: "missing_credentials" 
      });
    }

    // User'ı users tablosundan bul
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase())
      .single();

    if (userError || !user) {
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_credentials" 
      });
    }

    // Password kontrolü
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_credentials" 
      });
    }

    // Role kontrolü - sadece DOCTOR login olabilir
    if (user.role !== "DOCTOR") {
      return res.status(403).json({ 
        ok: false, 
        error: "doctor_approval_required" 
      });
    }

    // JWT token üret (role içerir)
    const token = jwt.sign(
      {
        type: "doctor",
        userId: user.id,
        email: user.email,
        role: user.role, // 🔥 KRİTİK: role bilgisi
        clinicId: req.admin?.clinicId // Doktorun kliniği
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    console.log("[DOCTOR LOGIN] Doctor logged in:", { 
      userId: user.id, 
      email: user.email,
      role: user.role 
    });

    res.json({
      ok: true,
      type: "doctor",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("[DOCTOR LOGIN] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ================= SUPABASE FUNCTION =================

// Transaction fonksiyonu
const approveDoctorApplicationFunction = `
CREATE OR REPLACE FUNCTION approve_doctor_application(
  application_id UUID,
  clinic_id UUID
)
RETURNS JSON AS $$
DECLARE
  application_record RECORD;
  user_record RECORD;
  doctor_record RECORD;
BEGIN
  -- 1️⃣ Başvuruyu bul
  SELECT * INTO application_record 
  FROM doctor_applications 
  WHERE id = application_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'application_not_found');
  END IF;
  
  -- 2️⃣ User'ı bul
  SELECT * INTO user_record 
  FROM users 
  WHERE id = application_record.user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'user_not_found');
  END IF;
  
  -- 3️⃣ Başvuruyu onayla
  UPDATE doctor_applications 
  SET status = 'APPROVED',
      approved_at = NOW()
  WHERE id = application_id;
  
  -- 4️⃣ User role'unu güncelle (PATIENT → DOCTOR)
  UPDATE users 
  SET role = 'DOCTOR',
      updated_at = NOW()
  WHERE id = application_record.user_id;
  
  -- 5️⃣ Doctors tablosuna ekle
  INSERT INTO doctors (
    user_id,
    clinic_id,
    full_name,
    email,
    phone,
    license_number,
    specialty,
    created_at
  ) VALUES (
    application_record.user_id,
    clinic_id,
    user_record.email, -- Geçici olarak email
    user_record.email,
    user_record.phone,
    application_record.license_number,
    application_record.specialty,
    NOW()
  );
  
  RETURN json_build_object(
    'ok', true, 
    'message', 'Doctor application approved successfully',
    'userId', application_record.user_id
  );
END;
$$ LANGUAGE plpgsql;
`;

module.exports = router;
module.exports.approveDoctorApplicationFunction = approveDoctorApplicationFunction;
