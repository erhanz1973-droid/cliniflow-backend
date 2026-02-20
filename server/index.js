require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { createClient } = require("@supabase/supabase-js");
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const treatmentRoutes = require("./routes/treatment");
const treatmentGroupRoutes = require("./routes/treatment-groups");
const patientRoutes = require("./routes/patients");
const patientGroupAssignmentRoutes = require("./routes/patient-group-assignments");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

// ROUTES
app.use("/api/treatment", treatmentRoutes);
app.use("/api/treatment-groups", treatmentGroupRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/patient-group-assignments", patientGroupAssignmentRoutes);

// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({ ok: true, backend: "real-server", port: PORT });
});

// ================= ADMIN LOGIN ================= */
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password, clinicCode } = req.body;

    // Validation
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

    // Query Supabase for admin
    const { data: admin, error } = await supabase
      .from("admins")
      .select("*")
      .eq("email", trimmedEmail)
      .eq("clinic_code", trimmedClinicCode)
      .single();

    if (error) {
      console.error("[ADMIN LOGIN] Supabase error:", error);
      return res.status(500).json({ ok: false, error: "server_error" });
    }

    if (!admin) {
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_admin_credentials" 
      });
    }

    if (admin.status !== "ACTIVE") {
      return res.status(403).json({ 
        ok: false, 
        error: "admin_inactive" 
      });
    }

    // Verify password using bcrypt
    const passwordMatch = await bcrypt.compare(trimmedPassword, admin.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ 
        ok: false, 
        error: "invalid_admin_credentials" 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        adminId: admin.id,
        role: "ADMIN",
        clinicCode: trimmedClinicCode
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Return success response
    return res.json({
      ok: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        clinicCode: admin.clinic_code
      }
    });

  } catch (err) {
    console.error("[ADMIN LOGIN] Error:", err);
    return res.status(500).json({ 
      ok: false, 
      error: "server_error" 
    });
  }
});

// STATIC FILES
app.use(express.static(path.join(__dirname, '../public')));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Real backend running on port ${PORT}`);
});
