// routes/admin/doctors.js
// Mounted at: app.use('/api/admin', adminDoctorsRouter)
// Covers: POST /api/admin/approve-doctor, POST /api/admin/approve,
//         POST /api/admin/clear-doctor, GET /api/admin/doctors,
//         GET /api/admin/doctor-applications
//
// NOTE: The following routes have non-standard URL prefixes and stay in index.cjs for Phase 1:
//   POST /admin/approve-doctor-v2  (line 4418)
//   GET  /admin/doctor-list        (line 11238)
//   GET  /debug/clinic-doctors     (line 11031)

const path = require('path');
const express = require('express');
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
const { supabase }  = require(appPath('lib', 'supabase'));
const { adminAuth } = require(appPath('admin-auth-middleware.js'));

const router = express.Router();

/* ================= ADMIN APPROVE DOCTOR ================= */
// Original location: index.cjs line 4349
// NOTE: A duplicate of this route exists at line 7546 with different logic.
//       Only this version (line 4349) is included — the duplicate in index.cjs
//       will be left commented there since Express only uses the first match.
router.post('/approve-doctor', adminAuth, async (req, res) => {
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
      status:   updatedDoctor.status,
      message:  "Doctor approved successfully",
    });

  } catch (err) {
    console.error("[ADMIN APPROVE DOCTOR] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN APPROVE (PATIENT) ================= */
// Original location: index.cjs line 4487
router.post('/approve', adminAuth, async (req, res) => {
  try {
    const { requestId, patientId } = req.body || {};

    if (!requestId && !patientId) {
      return res.status(400).json({ ok: false, error: "requestId_or_patientId_required" });
    }

    const targetPatientId  = patientId || requestId;
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
      status:    updatedPatient.status,
      message:   "Patient approved successfully",
    });
  } catch (err) {
      console.error("REGISTER_DOCTOR_ERROR:", err);
    console.error("[ADMIN APPROVE] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= ADMIN CLEAR DOCTOR ================= */
// Original location: index.cjs line 7152
router.post('/clear-doctor', adminAuth, async (req, res) => {
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

/* ================= ADMIN DOCTORS LIST ================= */
// Original location: index.cjs line 10953
router.get('/doctors', adminAuth, async (req, res) => {
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
        id:          doctor.id,
        doctor_id:   doctor.doctor_id || null,
        name:        preferredName,
        email:       doctor.email,
        phone:       doctor.phone,
        department:  doctor.department,
        specialties: doctor.specialties,
        status:      doctor.status,
        role:        doctor.role,
        created_at:  doctor.created_at,
        updated_at:  doctor.updated_at
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

/* ================= ADMIN DOCTOR APPLICATIONS ================= */
// Original location: index.cjs line 11209
router.get('/doctor-applications', adminAuth, async (req, res) => {
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

module.exports = router;
