// server/routes/treatment.js
const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("[TREATMENT ROUTE] Supabase import result:", { supabase: !!supabase });

// Test route without authentication
router.get('/test', async (req, res) => {
  return res.json({ ok: true, message: 'Treatment router is working!' });
});

// GET treatment plan by diagnosis
router.get("/diagnoses/:diagnosisId/plan", async (req, res) => {
  try {
    const { diagnosisId } = req.params;
    
    if (!diagnosisId) {
      return res.status(400).json({
        ok: false,
        error: "diagnosis_id_required"
      });
    }

    // Query Supabase for treatment plan
    const { data: treatments, error } = await supabase
      .from("treatments")
      .select("*")
      .eq("diagnosis_id", diagnosisId);

    if (error) {
      console.error("[TREATMENT] Error fetching treatments:", error);
      return res.status(500).json({
        ok: false,
        error: "database_error"
      });
    }

    return res.json({
      ok: true,
      diagnosisId,
      treatments: treatments || []
    });

  } catch (err) {
    console.error("[TREATMENT] Error:", err);
    return res.status(500).json({
      ok: false,
      error: "server_error"
    });
  }
});

module.exports = router;
