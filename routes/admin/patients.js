// routes/admin/patients.js
// Mounted at: app.use('/api/admin', adminPatientsRouter)
// Covers: GET/POST /api/admin/patients, GET /api/admin/patients/:id,
//         GET /api/admin/patients/:id/health, GET /api/admin/active-patients,
//         POST /api/admin/assign-patient, POST /api/admin/assign-primary-doctor,
//         GET /api/admin/patient/:id/messages, GET /api/admin/unread-count,
//         GET /api/admin/find-test-data

const path = require('path');
const express = require('express');
const jwt     = require('jsonwebtoken');
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
const { supabase }  = require(appPath('lib', 'supabase'));
const { adminAuth } = require(appPath('admin-auth-middleware.js'));

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/* ================= ADMIN PATIENTS (GET) ================= */
// Original location: index.cjs line 3445
router.get('/patients', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin.clinicId;
    console.log("[ADMIN PATIENTS] CLINIC ID:", clinicId);

    if (!clinicId) {
      console.warn("[ADMIN PATIENTS] Missing clinicId — cannot fetch patients");
      return res.status(400).json({ ok: false, error: "missing_clinic_id" });
    }

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
      .eq("clinic_id", clinicId)
      .eq("role", "PATIENT")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[ADMIN PATIENTS] DB error:", error.message, "code:", error.code);
      return res.status(500).json({ ok: false, error: "failed_to_fetch_patients" });
    }

    console.log(`[ADMIN PATIENTS] Found ${patients?.length ?? 0} patients for clinic ${clinicId}`);

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

/* ================= ADMIN PATIENTS (POST - Create Patient) ================= */
// Original location: index.cjs line 3706
router.post('/patients', adminAuth, async (req, res) => {
  try {
    const { name, phone, referralCode: inviterReferralCodeRaw } = req.body || {};

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ ok: false, error: "phone_required", message: "Phone number is required" });
    }

    // Get clinic info (plan and maxPatients)
    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, clinic_code, plan, max_patients")
      .eq("id", req.admin?.clinicId)
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
        .eq("clinic_id", req.admin?.clinicId);

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

    const patientCode    = await generatePatientCode();
    const nextPatientId  = patientCode;
    const referralCode   = patientCode;

    // Create patient
    let newPatient;
    let patientError;

    const { data: patientWithCode, error: errorWithCode } = await supabase
      .from("patients")
      .insert({
        clinic_id:    clinic.id,
        patient_id:   nextPatientId,
        referral_code: referralCode,
        name:          name || "",
        phone:         String(phone).trim(),
        status:        "PENDING",
      })
      .select()
      .single();

    if (errorWithCode && errorWithCode.message && errorWithCode.message.includes("referral_code")) {
      console.warn("[ADMIN CREATE PATIENT] referral_code column not found, inserting without referral_code");
      const { data: patientWithoutCode, error: errorWithoutCode } = await supabase
        .from("patients")
        .insert({
          clinic_id:  clinic.id,
          patient_id: nextPatientId,
          name:       name || "",
          phone:      String(phone).trim(),
          status:     "PENDING",
        })
        .select()
        .single();

      newPatient   = patientWithoutCode;
      patientError = errorWithoutCode;
    } else {
      newPatient   = patientWithCode;
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
          await getSupabase(req).from("patients").delete().eq("id", newPatient.id);
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

      const referralId   = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const referralData = {
        referral_id:           referralId,
        clinic_id:             clinic.id,
        inviter_patient_id:    inviterPatient.id,
        inviter_patient_name:  inviterPatient.name || "",
        invited_patient_id:    newPatient.id,
        invited_patient_name:  newPatient.name || "",
        status:                "pending",
      };

      const { error: refErr } = await supabase
        .from("referrals")
        .insert(referralData);

      if (refErr) {
        console.error("[ADMIN CREATE PATIENT] Failed to create referral:", refErr);
        // Rollback patient to keep data consistent
        try {
          await getSupabase(req).from("patients").delete().eq("id", newPatient.id);
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
      patientId:    newPatient.name,
      referralCode: newPatient.referral_code || newPatient.name,
      name:         newPatient.name   || "",
      phone:        newPatient.phone  || "",
      status:       newPatient.status,
      createdAt:    newPatient.created_at ? new Date(newPatient.created_at).getTime() : Date.now(),
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN CREATE PATIENT] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error", details: error?.message });
  }
});

/* ================= ADMIN FIND TEST DATA ================= */
// Original location: index.cjs line 8542
// NOTE: No auth guard — debug endpoint.
router.get('/find-test-data', async (req, res) => {
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
      doctors:  doctors  || [],
      errors: {
        patientError: patientError?.message,
        doctorError:  doctorError?.message
      }
    });
  } catch (error) {
    res.json({ ok: false, error: error.message });
  }
});

/* ================= ADMIN ASSIGN PATIENT ================= */
// Original location: index.cjs line 8575
router.post('/assign-patient', adminAuth, async (req, res) => {
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
        assignmentType:  "primary_only"
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

/* ================= ADMIN PATIENT DETAIL ================= */
// Original location: index.cjs line 10778
router.get('/patients/:patientId', adminAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.admin.clinicId;

    console.log("[ADMIN PATIENT DETAIL] QUERY PARAMS:", { patientId, clinicId });

    if (!patientId) {
      return res.status(400).json({ ok: false, error: "patientId_required" });
    }
    if (!clinicId) {
      return res.status(400).json({ ok: false, error: "missing_clinic_id" });
    }

    // Fetch patient from patients table — try by UUID first, then by patient_id string
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
      console.error("[ADMIN PATIENT DETAIL] Error:", error?.message, "clinicId:", clinicId, "patientId:", patientId);
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

/* ================= ADMIN ASSIGN PRIMARY DOCTOR ================= */
// Original location: index.cjs line 10824
router.post('/assign-primary-doctor', adminAuth, async (req, res) => {
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
// Original location: index.cjs line 10855
router.get('/patient/:patientId/messages', adminAuth, async (req, res) => {
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
// Original location: index.cjs line 10911
router.get('/unread-count', adminAuth, async (req, res) => {
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

/* ================= ADMIN ACTIVE PATIENTS ================= */
// Original location: index.cjs line 11266
// NOTE: Uses inline JWT verification — kept exactly as-is.
router.get('/active-patients', adminAuth, async (req, res) => {
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

/* ================= ADMIN PATIENT HEALTH (GET) ================= */
// Original location: index.cjs line 12879
router.get('/patients/:patientId/health', adminAuth, async (req, res) => {
  try {
    const rawId    = String(req.params.patientId || "").trim();
    if (!rawId) {
      return res.status(400).json({ ok: false, error: "patient_id_required" });
    }

    const clinicId   = req.admin?.clinicId;
    const clinicCode = req.admin?.clinicCode || req.clinicCode;

    // Resolve patient: try UUID first, then TEXT patient_id
    let patientData = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);

    if (isUuid) {
      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_id, clinic_code")
        .eq("id", rawId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: "database_error", details: error.message });
      patientData = data;
    }

    if (!patientData) {
      const { data, error } = await supabase
        .from("patients")
        .select("id, patient_id, clinic_code")
        .eq("patient_id", rawId)
        .eq("clinic_id", clinicId)
        .maybeSingle();
      if (error) return res.status(500).json({ ok: false, error: "database_error", details: error.message });
      patientData = data;
    }

    if (!patientData) {
      return res.status(404).json({ ok: false, error: "patient_not_found" });
    }

    const resolvedUuid     = patientData.id;
    const resolvedTextId   = patientData.patient_id || rawId;
    const resolvedClinicCode = patientData.clinic_code || clinicCode;

    // Get health form — try by UUID, then by TEXT patient_id
    let healthForm = null;
    for (const pid of [resolvedUuid, resolvedTextId]) {
      let q = getSupabase(req).from("patient_health_forms").select("*").eq("patient_id", pid);
      if (resolvedClinicCode) q = q.eq("clinic_code", resolvedClinicCode);
      const { data, error } = await q.maybeSingle();
      if (error && !["PGRST116"].includes(String(error.code))) {
        console.error("Admin Health Form GET - Supabase error:", error);
      }
      if (data) { healthForm = data; break; }
    }

    if (!healthForm) {
      return res.json({ ok: true, formData: null, isComplete: false });
    }

    res.json({
      ok: true,
      formData:    healthForm.form_data    || {},
      isComplete:  healthForm.is_complete  || false,
      completedAt: healthForm.completed_at || null,
      updatedAt:   healthForm.updated_at   || null,
      createdAt:   healthForm.created_at   || null
    });
  } catch (err) {
    console.error("Admin Health Form GET - Error:", err);
    res.status(500).json({ ok: false, error: "health_form_fetch_failed", details: err.message });
  }
});

/* ================= GET /api/admin/metrics/monthly-active-patients ================= */
// Returns new patient registrations per month for the past N months.
// Counts every patient by their created_at (registration date), no status filter.
router.get('/metrics/monthly-active-patients', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin.clinicId;
    const months = Math.min(parseInt(req.query.months) || 6, 24);

    // Supabase returns timestamps like "2026-02-13 11:17:00.111+00"
    // (space instead of T, +00 without colon). Normalise to proper ISO 8601 so
    // Node.js parses reliably on all platforms.
    const normalizeTs = (str) => {
      if (!str) return null;
      return String(str)
        .replace(' ', 'T')           // "2026-02-13 11:17..." → "2026-02-13T11:17..."
        .replace(/\+00$/, '+00:00'); // "+00" → "+00:00"
    };

    // Build month buckets using UTC values so server timezone has no effect.
    const now = new Date();
    const nowYear  = now.getUTCFullYear();
    const nowMonth = now.getUTCMonth(); // 0-based
    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
      // Step back i months from current UTC month
      const d = new Date(Date.UTC(nowYear, nowMonth - i, 1));
      buckets.push({
        year:  d.getUTCFullYear(),
        month: d.getUTCMonth(),
        monthLabel: d.toLocaleDateString('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
        activePatients: 0,
      });
    }

    // Fetch ALL patients for this clinic — no status filter
    const { data: patients, error } = await supabase
      .from('patients')
      .select('id, created_at')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[MONTHLY PATIENTS] DB error:', error.message);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    let skipped = 0;
    // Distribute each patient into their registration-month bucket (UTC)
    (patients || []).forEach(p => {
      const iso = normalizeTs(p.created_at);
      if (!iso) { skipped++; return; }
      const d = new Date(iso);
      if (isNaN(d.getTime())) { skipped++; return; }
      const year  = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const bucket = buckets.find(b => b.year === year && b.month === month);
      if (bucket) bucket.activePatients++;
      else skipped++;
    });

    console.log('[MONTHLY PATIENTS] total:', (patients || []).length, 'skipped:', skipped,
      '| buckets:', buckets.map(b => `${b.monthLabel}:${b.activePatients}`).join(' '));

    // Compute month-over-month growth %
    const data = buckets.map((b, idx) => {
      const prev = buckets[idx - 1];
      let growthPercent = null;
      if (prev && prev.activePatients > 0) {
        growthPercent = Math.round(((b.activePatients - prev.activePatients) / prev.activePatients) * 100);
      }
      return { monthLabel: b.monthLabel, activePatients: b.activePatients, growthPercent };
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error('[MONTHLY PATIENTS] crash:', err.message);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/* ================= ADMIN PATIENT FILES (GET) ================= */
router.get('/patients/:patientId/files', adminAuth, async (req, res) => {
  try {
    const rawId    = String(req.params.patientId || "").trim();
    if (!rawId) return res.status(400).json({ ok: false, error: "patient_id_required" });

    const clinicId = req.admin?.clinicId;
    const isUuid   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);

    // Resolve patient UUID
    let patientUuid = null;
    if (isUuid) {
      const { data } = await supabase
        .from("patients").select("id, clinic_id")
        .eq("id", rawId).maybeSingle();
      if (data) {
        if (clinicId && data.clinic_id && data.clinic_id !== clinicId) {
          return res.status(403).json({ ok: false, error: "access_denied" });
        }
        patientUuid = data.id;
      }
    }
    if (!patientUuid) {
      const { data } = await supabase
        .from("patients").select("id, clinic_id")
        .eq("patient_id", rawId).maybeSingle();
      if (data) {
        if (clinicId && data.clinic_id && data.clinic_id !== clinicId) {
          return res.status(403).json({ ok: false, error: "access_denied" });
        }
        patientUuid = data.id;
      }
    }
    if (!patientUuid) return res.status(404).json({ ok: false, error: "patient_not_found" });

    const { data: rows, error: dbErr } = await supabase
      .from("patient_files")
      .select("*")
      .eq("patient_id", patientUuid)
      .order("created_at", { ascending: false });

    if (dbErr) {
      console.error("[ADMIN FILES] DB error:", dbErr.message);
      return res.json({ ok: true, files: [] });
    }

    const files = (rows || []).map(r => ({
      id:         r.id,
      name:       r.file_name  || r.name || "Dosya",
      url:        r.file_url   || r.url  || null,
      mimeType:   r.mime_type  || r.mimeType || "application/octet-stream",
      fileType:   r.file_type  || r.fileType || "file",
      subtype:    r.subtype    || null,
      size:       r.file_size  || r.size || 0,
      createdAt:  r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      from:       r.uploaded_by === "CLINIC" || r.from === "CLINIC" ? "CLINIC" : "PATIENT",
    }));

    res.json({ ok: true, files, total: files.length });
  } catch (err) {
    console.error("[ADMIN FILES] crash:", err.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

module.exports = router;
