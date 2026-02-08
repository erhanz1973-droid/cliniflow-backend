// ICD-10 API Endpoints
module.exports = (app) => {
  // Get ICD-10 codes (with multilingual support)
  app.get("/api/icd10/codes", async (req, res) => {
    try {
      const { category, language = "tr", search } = req.query;
      
      let query = supabase.from("icd10_codes").select("*");
      
      if (category) {
        query = query.eq("category", category);
      }
      
      if (search) {
        const searchColumn = `title_${language}`;
        query = query.or(`${searchColumn}.ilike.%${search}%,code.ilike.%${search}%`);
      }
      
      const { data: codes, error } = await query.order("code");
      
      if (error) {
        console.error("[ICD-10] Error fetching codes:", error);
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }
      
      res.json({
        ok: true,
        codes: codes || [],
      });
    } catch (error) {
      console.error("[ICD-10] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Get patient ICD-10 diagnoses
  app.get("/api/patient/:patientId/icd10", async (req, res) => {
    try {
      const { patientId } = req.params;
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

      // Check authorization
      if (decoded.role !== "ADMIN" && decoded.patientId !== patientId) {
        return res.status(403).json({ ok: false, error: "access_denied" });
      }

      const { data: diagnoses, error } = await supabase
        .from("patient_icd10")
        .select(`
          *,
          icd10_codes (
            code,
            category,
            title_tr,
            title_en,
            title_ka,
            title_ru,
            is_dental
          )
        `)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ICD-10] Error fetching patient diagnoses:", error);
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }

      res.json({
        ok: true,
        diagnoses: diagnoses || [],
      });
    } catch (error) {
      console.error("[ICD-10] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Add ICD-10 diagnosis to patient
  app.post("/api/patient/:patientId/icd10", async (req, res) => {
    try {
      const { patientId } = req.params;
      const { icd10Code, toothNumber, notes } = req.body;
      
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

      // Only doctors can add diagnoses
      if (decoded.role !== "DOCTOR" && decoded.role !== "ADMIN") {
        return res.status(403).json({ ok: false, error: "doctor_required" });
      }

      // Validate ICD-10 code
      const { data: icd10CodeData, error: codeError } = await supabase
        .from("icd10_codes")
        .select("code")
        .eq("code", icd10Code)
        .single();

      if (codeError || !icd10CodeData) {
        return res.status(400).json({ ok: false, error: "invalid_icd10_code" });
      }

      // Check ICD-10 requirement
      const { data: requirement, error: reqError } = await supabase
        .from("icd10_requirements")
        .select("require_icd10")
        .or(`doctor_id.eq.${decoded.patientId},clinic_id.eq.${decoded.clinicId}`)
        .single();

      if (reqError) {
        console.warn("[ICD-10] Could not check requirement:", reqError);
      }

      // Add diagnosis
      const { data: diagnosis, error } = await supabase
        .from("patient_icd10")
        .insert({
          patient_id: patientId,
          icd10_code: icd10Code,
          tooth_number: toothNumber || null,
          notes: notes || null,
          doctor_id: decoded.patientId,
          clinic_id: decoded.clinicId,
          diagnosis_date: new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

      if (error) {
        console.error("[ICD-10] Error adding diagnosis:", error);
        return res.status(500).json({ ok: false, error: "add_failed" });
      }

      res.json({
        ok: true,
        message: "ICD-10 diagnosis added successfully",
        diagnosis,
      });
    } catch (error) {
      console.error("[ICD-10] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Get ICD-10 requirements
  app.get("/api/icd10/requirements", async (req, res) => {
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

      const { data: requirements, error } = await supabase
        .from("icd10_requirements")
        .select("*")
        .or(`doctor_id.eq.${decoded.patientId},clinic_id.eq.${decoded.clinicId}`);

      if (error) {
        console.error("[ICD-10] Error fetching requirements:", error);
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }

      res.json({
        ok: true,
        requirements: requirements || [],
      });
    } catch (error) {
      console.error("[ICD-10] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Update ICD-10 requirements (admin only)
  app.put("/api/icd10/requirements", async (req, res) => {
    try {
      const { doctorId, clinicId, requireIcd10 } = req.body;
      
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

      const { data: requirement, error } = await supabase
        .from("icd10_requirements")
        .upsert({
          doctor_id: doctorId,
          clinic_id: clinicId,
          require_icd10: requireIcd10,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("[ICD-10] Error updating requirements:", error);
        return res.status(500).json({ ok: false, error: "update_failed" });
      }

      res.json({
        ok: true,
        message: "ICD-10 requirements updated successfully",
        requirement,
      });
    } catch (error) {
      console.error("[ICD-10] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Admin ICD-10 usage summary
  app.get("/api/admin/icd10-summary", async (req, res) => {
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

      // Get usage statistics
      const { data: stats, error: statsError } = await supabase
        .from("patient_icd10")
        .select(`
          icd10_code,
          created_at,
          icd10_codes!inner (
            category,
            title_tr,
            title_en,
            title_ka,
            title_ru
          )
        `);

      if (statsError) {
        console.error("[ICD-10] Error fetching stats:", statsError);
        return res.status(500).json({ ok: false, error: "fetch_failed" });
      }

      // Calculate summary
      const totalDiagnoses = stats?.length || 0;
      const uniquePatients = new Set(stats?.map(s => s.patient_id)).size;
      const mostUsedCodes = {};
      
      stats?.forEach(diagnosis => {
        const code = diagnosis.icd10_code;
        mostUsedCodes[code] = (mostUsedCodes[code] || 0) + 1;
      });

      const topCodes = Object.entries(mostUsedCodes)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([code, count]) => {
          const codeInfo = stats.find(s => s.icd10_code === code);
          return {
            code,
            count,
            title: codeInfo?.icd10_codes?.title_tr || code,
          };
        });

      const lastEntryDate = stats?.length > 0 
        ? Math.max(...stats.map(s => new Date(s.created_at).getTime()))
        : null;

      res.json({
        ok: true,
        summary: {
          totalDiagnoses,
          uniquePatients,
          topCodes,
          lastEntryDate: lastEntryDate ? new Date(lastEntryDate).toISOString() : null,
          hasICD10Entries: totalDiagnoses > 0,
        },
      });
    } catch (error) {
      console.error("[ICD-10] Error:", error);
      res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
};
