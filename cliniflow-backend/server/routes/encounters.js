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
  try {
    const { encounterId } = req.params;

    // 1. Find treatment plans for this encounter
    const { data: plans, error: plansError } = await supabase
      .from("treatment_plans")
      .select("id, status, created_at")
      .eq("encounter_id", encounterId);

    if (plansError) {
      console.error("[ENCOUNTER PLAN] treatment_plans error:", plansError);
      return res.status(500).json({ ok: false, error: plansError.message });
    }

    if (!plans || plans.length === 0) {
      return res.json({ ok: true, treatments: [] });
    }

    const planIds = plans.map((p) => p.id);

    // 2. Fetch treatment items — try progressively narrower column sets
    const selectCandidates = [
      "id, treatment_plan_id, tooth_fdi_code, tooth_number, procedure_code, procedure_name, procedure_description, status, scheduled_at, scheduled_date, created_at, updated_at",
      "id, treatment_plan_id, tooth_fdi_code, tooth_number, procedure_code, procedure_name, status, scheduled_at, created_at, updated_at",
      "id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, created_at",
    ];

    let items = [];
    for (const sel of selectCandidates) {
      const { data, error } = await supabase
        .from("treatment_items")
        .select(sel)
        .in("treatment_plan_id", planIds);

      if (!error) { items = data || []; break; }
      if (!["42703", "PGRST204"].includes(String(error?.code || ""))) break;
    }

    // 3. Map to a clean response shape
    const treatments = items.map((item) => ({
      id: item.id,
      treatment_plan_id: item.treatment_plan_id,
      tooth_number: item.tooth_fdi_code ?? item.tooth_number ?? null,
      procedure_code: item.procedure_code ?? null,
      procedure_name: item.procedure_name ?? item.procedure_description ?? null,
      status: String(item.status || "PLANNED").toUpperCase(),
      scheduled_at: item.scheduled_at ?? item.scheduled_date ?? null,
      created_at: item.created_at ?? null,
    }));

    return res.json({ ok: true, treatments });
  } catch (err) {
    console.error("[ENCOUNTER PLAN] crash:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
