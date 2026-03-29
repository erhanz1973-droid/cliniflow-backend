const express = require("express");
const router = express.Router();
const { supabase } = require("../lib/supabase");

// encounter
router.get("/encounters/:encounterId", async (req, res) => {
  res.json({
    ok: true,
    encounterId: req.params.encounterId
  });
});


router.get("/:id/diagnoses", async (req, res) => {
  try {
    const encounterId = req.params.id;
    console.log("Diagnoses endpoint called for encounter:", encounterId);

    const { data, error } = await supabase
      .from("encounter_diagnoses")
      .select("id, encounter_id, tooth_number, icd10_code, icd10_description, notes")
      .eq("encounter_id", encounterId)
      .limit(50);

    if (error) {
      console.error("Supabase diagnoses error:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    console.log("Diagnoses result:", data);

    res.json({
      ok: true,
      data: data || []
    });

  } catch (err) {
    console.error("Diagnoses route crash:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// treatment plan
router.get("/encounters/:encounterId/plan", async (req, res) => {
  res.json({
    ok: true,
    treatments: []
  });
});

module.exports = router;
