// routes/admin/auth.js
// Mounted at: app.use('/api/admin', adminAuthRouter)
// Covers: POST /api/admin/register, POST /api/admin/login,
//         GET  /api/admin/token-test, GET /api/admin/test

const path = require('path');
const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
const { supabase }                  = require(appPath('lib', 'supabase'));
const { insertWithColumnPruning }   = require(appPath('lib', 'helpers'));
const { adminAuth }                 = require(appPath('admin-auth-middleware.js'));

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/* ================= ADMIN REGISTER ================= */
// Original location: index.cjs line 2111
router.post('/register', async (req, res) => {
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

/* ================= ADMIN LOGIN ================= */
// Original location: index.cjs line 2738
router.post('/login', async (req, res) => {
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

    console.log("[ADMIN LOGIN] Attempting login for email:", trimmedEmail, "clinicCode:", trimmedClinicCode);

    const { data: admin, error: adminError } = await supabase
      .from("admins")
      .select("id, email, clinic_code, password_hash, status, name")
      .eq("email", trimmedEmail)
      .eq("clinic_code", trimmedClinicCode)
      .maybeSingle();

    console.log("[ADMIN LOGIN] admins table lookup:", { found: !!admin, adminError: adminError?.message });

    if (!adminError && admin) {
      const adminStatus = String(admin.status || "ACTIVE").toUpperCase();
      console.log("[ADMIN LOGIN] Admin status:", adminStatus, "has password_hash:", !!admin.password_hash);
      if (adminStatus !== "ACTIVE") {
        console.log("[ADMIN LOGIN] FAIL: admin status not ACTIVE");
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      const passwordMatch = await checkPassword(trimmedPassword, admin.password_hash);
      console.log("[ADMIN LOGIN] Password match (admins table):", passwordMatch);
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

      console.log("[ADMIN LOGIN] Fallback: clinics table lookup for code:", trimmedClinicCode, "found:", !!clinicRow, "error:", clinicError?.message);
      if (clinicError || !clinicRow) {
        console.error("[ADMIN LOGIN] FAIL: Clinic not found by clinic_code:", trimmedClinicCode);
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      const clinicEmail = String(clinicRow.email || "").trim().toLowerCase();
      console.log("[ADMIN LOGIN] Clinic email in DB:", clinicEmail, "vs submitted:", trimmedEmail, "match:", clinicEmail === trimmedEmail);
      if (clinicEmail !== trimmedEmail) {
        console.log("[ADMIN LOGIN] FAIL: email mismatch");
        return res.status(401).json({ ok: false, error: "invalid_admin_credentials" });
      }

      const passwordMatch = await checkPassword(trimmedPassword, clinicRow.password_hash);
      console.log("[ADMIN LOGIN] Password match (clinics table):", passwordMatch, "has hash:", !!clinicRow.password_hash);
      if (!passwordMatch) {
        console.log("[ADMIN LOGIN] FAIL: password mismatch");
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
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN LOGIN] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN TOKEN TEST ================= */
// Original location: index.cjs line 4318
// NOTE: Uses legacy hardcoded secret — kept exactly as-is.
router.get('/token-test', async (req, res) => {
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
// Original location: index.cjs line 4340
router.get('/test', adminAuth, async (req, res) => {
  res.json({
    ok: true,
    message: "Admin auth working",
    admin: req.admin
  });
});

module.exports = router;
