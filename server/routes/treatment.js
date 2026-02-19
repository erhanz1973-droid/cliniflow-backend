const express = require("express");
const router = express.Router();
const { supabase } = require("../supabaseClient");

// GET treatment plans by encounter
router.get("/treatment/encounters/:encounterId/treatment-plans", async (req, res) => {
  const { encounterId } = req.params;

  try {
    const { data, error } = await supabase
      .from("treatment_plans")
      .select("*")
      .eq("encounter_id", encounterId);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

module.exports = router;
