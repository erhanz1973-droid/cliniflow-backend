// Get patient info endpoint
module.exports = (app) => {
  app.get("/api/patient/:patientId/info", async (req, res) => {
    try {
      const patientId = String(req.params.patientId || "").trim();
      if (!patientId) return res.status(400).json({ ok: false, error: "patient_id_required" });

      // Check if admin or patient token
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

      if (!token) {
        return res.status(401).json({ ok: false, error: "missing_token" });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }

      let patientUuid;
      let clinicId;

      if (decoded.role === "ADMIN") {
        // Admin can access any patient in their clinic
        clinicId = decoded.clinicId;
        
        // Get patient info
        const { data: patientData, error: patientError } = await supabase
          .from("patients")
          .select("id, patient_id, name, phone, email, status, role, clinic_id, created_at")
          .eq("patient_id", patientId)
          .eq("clinic_id", clinicId)
          .single();

        if (patientError || !patientData) {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }

        patientUuid = patientData.id;
        
        // Return patient info
        return res.json({
          ok: true,
          patient: {
            patient_id: patientData.patient_id,
            name: patientData.name,
            phone: patientData.phone,
            email: patientData.email,
            status: patientData.status,
            role: patientData.role,
            created_at: patientData.created_at,
          },
        });
      } else {
        // Patient token - verify patient ID matches
        if (!decoded.patientId) {
          return res.status(401).json({ ok: false, error: "invalid_token" });
        }

        if (decoded.patientId !== patientId) {
          return res.status(403).json({ ok: false, error: "patient_id_mismatch" });
        }

        // Get patient info
        const { data: patientData, error: patientError } = await supabase
          .from("patients")
          .select("id, patient_id, name, phone, email, status, role, clinic_id, created_at")
          .eq("patient_id", patientId)
          .single();

        if (patientError || !patientData) {
          return res.status(404).json({ ok: false, error: "patient_not_found" });
        }

        patientUuid = patientData.id;
        clinicId = patientData.clinic_id;

        // Return patient info
        return res.json({
          ok: true,
          patient: {
            patient_id: patientData.patient_id,
            name: patientData.name,
            phone: patientData.phone,
            email: patientData.email,
            status: patientData.status,
            role: patientData.role,
            created_at: patientData.created_at,
          },
        });
      }
    } catch (error) {
      console.error("[PATIENT INFO] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
};
