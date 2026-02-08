// Admin Notes API
module.exports = (app) => {
  app.post("/api/admin/notes", async (req, res) => {
    try {
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

      if (decoded.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: "admin_required" });
      }

      const { data: notes, error } = await supabase
        .from("admin_notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ADMIN NOTES] Error:", error);
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }

      res.json({
        ok: true,
        notes: notes || [],
      });
    } catch (error) {
      console.error("[ADMIN NOTES] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  app.post("/api/admin/notes", async (req, res) => {
    try {
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

      if (decoded.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: "admin_required" });
      }

      const { patientId, note } = req.body || {};

      if (!patientId || !note) {
        return res.status(400).json({ ok: false, error: "missing_data" });
      }

      const { data: newNote, error } = await supabase
        .from("admin_notes")
        .insert({
          patient_id: patientId,
          note: note.trim(),
          created_at: new Date().toISOString(),
          admin_id: decoded.adminId,
        })
        .select()
        .single();

      if (error) {
        console.error("[ADMIN NOTES] Save error:", error);
        return res.status(500).json({ ok: false, error: "save_failed" });
      }

      res.json({
        ok: true,
        message: "Note saved successfully",
      });
    } catch (error) {
      console.error("[ADMIN NOTES] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Admin Permissions API
  app.get("/api/admin/permissions", async (req, res) => {
    try {
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

      if (decoded.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: "admin_required" });
      }

      const { data: permissions, error } = await supabase
        .from("admin_permissions")
        .select("*")
        .single();

      if (error) {
        console.error("[ADMIN PERMISSIONS] Error:", error);
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }

      res.json({
        ok: true,
        permissions: permissions || {
          enableReferrals: true,
          enableInternationalPatients: false,
          requireICD10: false,
          enableDoctorPatientChat: true,
        },
      });
    } catch (error) {
      console.error("[ADMIN PERMISSIONS] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  app.put("/api/admin/permissions", async (req, res) => {
    try {
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

      if (decoded.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: "admin_required" });
      }

      const updates = req.body || {};

      const { data: permissions, error } = await supabase
        .from("admin_permissions")
        .update(updates)
        .eq("id", 1)
        .select()
        .single();

      if (error) {
        console.error("[ADMIN PERMISSIONS] Update error:", error);
        return res.status(500).json({ ok: false, error: "update_failed" });
      }

      res.json({
        ok: true,
        message: "Permissions updated successfully",
        permissions: permissions,
      });
    } catch (error) {
      console.error("[ADMIN PERMISSIONS] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Patient Overview API
  app.get("/api/admin/patient-overview", async (req, res) => {
    try {
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

      if (decoded.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: "admin_required" });
      }

      // Mock data for now
      const overview = {
        totalPatients: 1250,
        activeTreatments: 342,
        lastActivityDate: new Date().toISOString(),
      };

      res.json({
        ok: true,
        overview,
      });
    } catch (error) {
      console.error("[PATIENT OVERVIEW] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // ICD-10 Compliance API
  app.get("/api/admin/icd10-compliance", async (req, res) => {
    try {
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

      if (decoded.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: "admin_required" });
      }

      // Mock data for now
      const compliance = {
        hasICD10Entries: true,
        mostUsedCodes: ["Z01.4", "K02.9", "J02.0", "M25.1", "S42.0"],
        lastEntryDate: new Date().toISOString(),
      };

      res.json({
        ok: true,
        compliance,
      });
    } catch (error) {
      console.error("[ICD-10 COMPLIANCE] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
};
