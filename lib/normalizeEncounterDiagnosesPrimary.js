"use strict";

/**
 * Partial unique index idx_encounter_diagnoses_one_primary_true allows only one
 * is_primary = true per encounter. Payloads may mark several teeth as primary; last wins.
 */
function normalizeAtMostOnePrimaryDiagnosis(diagnoses) {
  const list = Array.isArray(diagnoses)
    ? diagnoses.map((d) => (d && typeof d === "object" ? { ...d } : d))
    : [];
  let idx = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    const row = list[i];
    if (row && typeof row === "object" && !!row.is_primary) {
      idx = i;
      break;
    }
  }
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (!row || typeof row !== "object") continue;
    row.is_primary = i === idx && idx >= 0;
  }
  return list;
}

async function clearEncounterDiagnosisPrimaryFlags(supabase, encounterId) {
  const eid = String(encounterId || "").trim();
  if (!eid || !supabase) return { data: null, error: null };
  return supabase
    .from("encounter_diagnoses")
    .update({ is_primary: false })
    .eq("encounter_id", eid)
    .eq("is_primary", true);
}

module.exports = {
  normalizeAtMostOnePrimaryDiagnosis,
  clearEncounterDiagnosisPrimaryFlags,
};
