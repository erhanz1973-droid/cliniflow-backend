/**
 * Ana Cliniflow API (index.cjs) ile uyumlu login endpoint'leri.
 * cliniflow-backend → server/index.js bu dosyayı mount eder.
 */

/**
 * @param {import("express").Application} app
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient; jwt: typeof import("jsonwebtoken") }} deps
 */
function registerLoginRoutes(app, { supabase, jwt }) {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET required");
  }

  app.post("/api/patient/login", async (req, res) => {
    try {
      const { phone } = req.body || {};

      if (!phone || !String(phone).trim()) {
        return res.status(400).json({
          ok: false,
          error: "phone_required",
          message: "Phone number is required",
        });
      }

      const trimmedPhone = String(phone).trim();

      const { data: patient, error } = await supabase
        .from("patients")
        .select("id, name, phone, status, clinic_id, clinic_code, role")
        .eq("phone", trimmedPhone)
        .maybeSingle();

      if (error) {
        console.error("[PATIENT LOGIN] Database error:", error);
        return res.status(500).json({
          ok: false,
          error: "internal_error",
          message: "Database error occurred",
        });
      }

      if (!patient) {
        return res.status(404).json({
          ok: false,
          error: "patient_not_found",
          message:
            "No patient found with this phone number. Please register first.",
        });
      }

      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .select("id, clinic_code, name")
        .eq("id", patient.clinic_id)
        .single();

      if (clinicError || !clinic) {
        console.error("[PATIENT LOGIN] Clinic lookup error:", clinicError);
        return res.status(500).json({
          ok: false,
          error: "internal_error",
          message: "Clinic lookup failed",
        });
      }

      const token = jwt.sign(
        {
          patientId: patient.name,
          clinicId: patient.clinic_id,
          clinicCode: clinic.clinic_code || patient.clinic_code || "",
          role: patient.role || "PATIENT",
          roleType: patient.role || "PATIENT",
          status: patient.status || "PENDING",
        },
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      return res.json({
        ok: true,
        user: {
          id: patient.name,
          token,
          type: "patient",
          role: patient.role || "PATIENT",
          name: patient.name || "",
          email: "",
          phone: patient.phone || "",
          patientId: patient.name,
          clinicId: patient.clinic_id,
          clinicCode: clinic.clinic_code || "",
          status: patient.status || "PENDING",
        },
      });
    } catch (err) {
      console.error("[PATIENT LOGIN] Error:", err);
      return res.status(500).json({
        ok: false,
        error: "internal_error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/api/doctor/login", async (req, res) => {
    try {
      const { email, phone, password, clinicCode } = req.body || {};

      if (!clinicCode || (!email && !phone)) {
        return res
          .status(400)
          .json({ ok: false, error: "missing_required_fields" });
      }

      const normalizedClinicCode = String(clinicCode).trim().toUpperCase();
      const normalizedEmail = email ? String(email).trim().toLowerCase() : "";

      let doctor = null;
      let doctorIdForToken = null;

      if (password) {
        const authEmail = normalizedEmail || `${phone}@cliniflow.app`;
        const { data: authData, error: authError } =
          await supabase.auth.signInWithPassword({
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
          .select(
            "id, doctor_id, full_name, name, email, phone, department, title, experience_years, languages, specialties, license_number, clinic_id, clinic_code, status"
          )
          .eq("id", authUserId)
          .eq("clinic_code", normalizedClinicCode)
          .in("status", ["APPROVED", "ACTIVE"])
          .maybeSingle();

        if (doctorById.error || !doctorById.data) {
          console.error(
            "[DOCTOR LOGIN] Doctor not found by auth user id:",
            doctorById.error
          );
          return res.status(401).json({
            ok: false,
            error: "doctor_not_found_or_not_approved",
          });
        }

        doctor = doctorById.data;
        doctorIdForToken = authUserId;
      } else {
        if (!normalizedEmail) {
          return res
            .status(400)
            .json({ ok: false, error: "email_required" });
        }

        const doctorByEmail = await supabase
          .from("doctors")
          .select(
            "id, doctor_id, full_name, name, email, phone, department, title, experience_years, languages, specialties, license_number, clinic_id, clinic_code, status"
          )
          .eq("email", normalizedEmail)
          .eq("clinic_code", normalizedClinicCode)
          .in("status", ["APPROVED", "ACTIVE"])
          .maybeSingle();

        if (doctorByEmail.error || !doctorByEmail.data) {
          console.error(
            "[DOCTOR LOGIN] Doctor not found by email:",
            doctorByEmail.error
          );
          return res.status(401).json({
            ok: false,
            error: "doctor_not_found_or_not_approved",
          });
        }

        doctor = doctorByEmail.data;
        doctorIdForToken = String(doctor.doctor_id || doctor.id || "").trim();
      }

      if (!doctor || !doctorIdForToken) {
        return res.status(401).json({
          ok: false,
          error: "doctor_not_found_or_not_approved",
        });
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
      return res.status(500).json({
        ok: false,
        error: "internal_error",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

module.exports = { registerLoginRoutes };
