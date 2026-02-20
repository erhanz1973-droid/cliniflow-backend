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
      return res.status(400).json({ ok: false, error: "diagnosisId missing" });
    }

    // UUID validation basic
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(diagnosisId)) {
      return res.status(400).json({ ok: false, error: "Invalid diagnosisId" });
    }

    const { data, error } = await supabase
      .from("treatment_plans")
      .select("*")
      .eq("diagnosis_id", diagnosisId)
      .single();

    if (error && error.code !== "PGRST116") {
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.json({ ok: true, plan: null });
    }

    return res.json({ ok: true, plan: data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Database migration endpoint
router.post("/migrate-diagnosis-based", async (req, res) => {
  try {
    console.log("[MIGRATION] Starting diagnosis-based migration...");
    
    // Add diagnosis_id column if not exists
    const { error: addColumnError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS diagnosis_id UUID REFERENCES encounter_diagnoses(id) ON DELETE CASCADE;'
    });
    
    if (addColumnError) {
      console.log("[MIGRATION] Column might already exist");
    }
    
    // Add unique constraint
    const { error: addConstraintError } = await supabase.rpc('exec_sql', {
      sql: 'CREATE UNIQUE INDEX IF NOT EXISTS unique_plan_per_diagnosis ON treatment_plans (diagnosis_id) WHERE diagnosis_id IS NOT NULL;'
    });
    
    if (addConstraintError) {
      console.log("[MIGRATION] Constraint might already exist");
    }
    
    console.log("[MIGRATION] Migration completed");
    return res.json({ ok: true, message: "Migration completed" });
    
  } catch (err) {
    console.error("[MIGRATION] Error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 2️⃣ POST Plan Create (Diagnosis Bazlı)
router.post("/diagnoses/:diagnosisId/plan", authenticateToken, async (req, res) => {
  try {
    const { diagnosisId } = req.params;
    const doctorId = req.user?.id;

    console.log("[CREATE PLAN BY DIAGNOSIS] HIT", diagnosisId);

    // Check if diagnosis exists
    const { data: diagnosis, error: diagnosisError } = await supabase
      .from("encounter_diagnoses")
      .select("id, encounter_id")
      .eq("id", diagnosisId)
      .single();

    if (diagnosisError || !diagnosis) {
      console.error("[CREATE PLAN] Diagnosis not found:", diagnosisId);
      return res.status(404).json({ ok: false, error: "Diagnosis not found" });
    }

    // Check if plan already exists
    const { data: existing, error: checkError } = await supabase
      .from("treatment_plans")
      .select("*")
      .eq("diagnosis_id", diagnosisId)
      .limit(1);

    if (checkError) {
      console.error("[CREATE PLAN CHECK ERROR]", checkError);
      return res.status(500).json({ ok: false, error: checkError.message });
    }

    if (existing && existing.length > 0) {
      console.log("[CREATE PLAN] Plan already exists, returning existing");
      
      // Get plan items
      const { data: items, error: itemsError } = await supabase
        .from("treatment_plan_items")
        .select("*")
        .eq("plan_id", existing[0].id)
        .order("created_at", { ascending: true });

      const planWithItems = {
        ...existing[0],
        items: itemsError ? [] : (items || [])
      };

      return res.json({ ok: true, plan: planWithItems });
    }

    // Create new plan
    const { data: newPlan, error: insertError } = await supabase
      .from("treatment_plans")
      .insert({
        diagnosis_id: diagnosisId,
        encounter_id: diagnosis.encounter_id,
        created_by: doctorId,
        status: "DRAFT"
      })
      .select()
      .single();

    if (insertError) {
      console.error("[CREATE PLAN INSERT ERROR]", insertError);
      return res.status(500).json({ ok: false, error: insertError.message });
    }

    console.log("[CREATE PLAN] Created new plan:", newPlan);
    return res.json({ ok: true, plan: { ...newPlan, items: [] } });

  } catch (err) {
    console.error("[CREATE PLAN CRASH]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// 3️⃣ POST Plan Item
router.post("/plans/:planId/items", authenticateToken, async (req, res) => {
  try {
    const { planId } = req.params;
    const {
      tooth_number,
      procedure_code,
      assigned_doctor_id,
      price
    } = req.body;

    console.log("[CREATE PLAN ITEM] HIT", planId);

    // Validate required fields
    if (!tooth_number || !procedure_code) {
      return res.status(400).json({ 
        ok: false, 
        error: "Missing required fields: tooth_number, procedure_code" 
      });
    }

    // Check if plan exists
    const { data: plan, error: planError } = await supabase
      .from("treatment_plans")
      .select("id")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      console.error("[CREATE ITEM] Plan not found:", planId);
      return res.status(404).json({ ok: false, error: "Plan not found" });
    }

    // Create new item
    const { data: newItem, error: insertError } = await supabase
      .from("treatment_plan_items")
      .insert({
        plan_id: planId,
        tooth_number,
        procedure_code,
        assigned_doctor_id: assigned_doctor_id || null,
        price: price || null,
        status: "PLANNED"
      })
      .select()
      .single();

    if (insertError) {
      console.error("[CREATE ITEM INSERT ERROR]", insertError);
      return res.status(500).json({ ok: false, error: insertError.message });
    }

    console.log("[CREATE PLAN ITEM] Created new item:", newItem);
    return res.json({ ok: true, item: newItem });

  } catch (err) {
    console.error("[CREATE ITEM CRASH]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
