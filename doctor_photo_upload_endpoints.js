/* ================= DOCTOR PHOTO UPLOAD ================= */
app.post("/api/doctor/upload-photo", async (req, res) => {
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

    // Check if doctor
    if (decoded.role !== "DOCTOR") {
      return res.status(403).json({ ok: false, error: "doctor_required" });
    }

    const { patientId } = decoded;
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "missing_patient_id" });
    }

    // Handle file upload
    const multer = require('multer');
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 3 * 1024 * 1024 // 3MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type'), false);
        }
      }
    });

    upload.single('photo')(req, res, async (err) => {
      if (err) {
        console.error("[UPLOAD PHOTO] Error:", err);
        return res.status(400).json({ ok: false, error: "upload_failed", details: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "no_file" });
      }

      try {
        // Generate unique filename
        const fileExtension = req.file.originalname.split('.').pop();
        const uniqueFilename = `doctor_${patientId}_${Date.now()}.${fileExtension}`;
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('doctor-profile')
          .upload(uniqueFilename, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: true
          });

        if (error) {
          console.error("[UPLOAD PHOTO] Storage error:", error);
          return res.status(500).json({ ok: false, error: "storage_error" });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('doctor-profile')
          .getPublicUrl(uniqueFilename);

        // Update patient record
        const { error: updateError } = await supabase
          .from("patients")
          .update({ profile_photo_url: publicUrl })
          .eq("patient_id", patientId);

        if (updateError) {
          console.error("[UPLOAD PHOTO] Update error:", updateError);
          return res.status(500).json({ ok: false, error: "update_failed" });
        }

        console.log("[UPLOAD PHOTO] Photo uploaded successfully:", { patientId, publicUrl });
        res.json({
          ok: true,
          profilePhotoUrl: publicUrl
        });
      } catch (error) {
        console.error("[UPLOAD PHOTO] Error:", error);
        res.status(500).json({ ok: false, error: "internal_error" });
      }
    });
  } catch (error) {
    console.error("[UPLOAD PHOTO] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

/* ================= DOCTOR DIPLOMA UPLOAD ================= */
app.post("/api/doctor/upload-diploma", async (req, res) => {
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

    // Check if doctor
    if (decoded.role !== "DOCTOR") {
      return res.status(403).json({ ok: false, error: "doctor_required" });
    }

    const { patientId } = decoded;
    if (!patientId) {
      return res.status(400).json({ ok: false, error: "missing_patient_id" });
    }

    // Handle file upload
    const multer = require('multer');
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type'), false);
        }
      }
    });

    upload.single('diploma')(req, res, async (err) => {
      if (err) {
        console.error("[UPLOAD DIPLOMA] Error:", err);
        return res.status(400).json({ ok: false, error: "upload_failed", details: err.message });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, error: "no_file" });
      }

      try {
        // Generate unique filename
        const fileExtension = req.file.originalname.split('.').pop();
        const uniqueFilename = `diploma_${patientId}_${Date.now()}.${fileExtension}`;
        
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('doctor-documents')
          .upload(uniqueFilename, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: true
          });

        if (error) {
          console.error("[UPLOAD DIPLOMA] Storage error:", error);
          return res.status(500).json({ ok: false, error: "storage_error" });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('doctor-documents')
          .getPublicUrl(uniqueFilename);

        // Update patient record
        const { error: updateError } = await supabase
          .from("patients")
          .update({ diploma_file_url: publicUrl })
          .eq("patient_id", patientId);

        if (updateError) {
          console.error("[UPLOAD DIPLOMA] Update error:", updateError);
          return res.status(500).json({ ok: false, error: "update_failed" });
        }

        console.log("[UPLOAD DIPLOMA] Diploma uploaded successfully:", { patientId, publicUrl });
        res.json({
          ok: true,
          diplomaFileUrl: publicUrl
        });
      } catch (error) {
        console.error("[UPLOAD DIPLOMA] Error:", error);
        res.status(500).json({ ok: false, error: "internal_error" });
      }
    });
  } catch (error) {
    console.error("[UPLOAD DIPLOMA] Error:", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});
