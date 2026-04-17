/**
 * Migration: patients.treatments JSONB diagnoses → encounter_diagnoses table
 *
 * This script finds diagnosis entries in patients.treatments JSONB that are NOT
 * already reflected in encounter_diagnoses, and inserts them.
 *
 * Rules:
 *  - Entries with meta.source === "encounter_diagnoses" and meta.id already exist in
 *    the table — skipped (verified by ID lookup).
 *  - Entries without meta (legacy) are inserted into a "migration" encounter
 *    created/found for that patient.
 *
 * Usage:
 *   node scripts/migrate-diagnoses-to-encounter-table.cjs [--dry-run]
 *
 * Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars before running.
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");

const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY,
  { auth: { persistSession: false } }
);

if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY)) {
  console.error("❌  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running.");
  process.exit(1);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ""));
}

async function findOrCreateMigrationEncounter(patientId) {
  // Look for an existing migration encounter first
  const existing = await supabase
    .from("patient_encounters")
    .select("id")
    .eq("patient_id", patientId)
    .eq("encounter_type", "migration")
    .limit(1)
    .maybeSingle();

  if (!existing.error && existing.data?.id) return existing.data.id;

  if (DRY_RUN) return `dry-run-encounter-${patientId}`;

  const inserted = await supabase
    .from("patient_encounters")
    .insert({
      patient_id: patientId,
      encounter_type: "migration",
      status: "completed",
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (inserted.error) {
    throw new Error(`Could not create migration encounter for patient ${patientId}: ${inserted.error.message}`);
  }

  return inserted.data.id;
}

async function diagnosisAlreadyExists(encounterId, icd10_code, icd10_description, tooth_number) {
  const q = await supabase
    .from("encounter_diagnoses")
    .select("id")
    .eq("encounter_id", encounterId)
    .eq("icd10_code", icd10_code || "")
    .limit(1)
    .maybeSingle();
  return !q.error && !!q.data?.id;
}

async function insertDiagnosis(row) {
  if (DRY_RUN) {
    console.log("  [DRY-RUN] would insert:", JSON.stringify(row));
    return;
  }
  const res = await supabase.from("encounter_diagnoses").insert(row);
  if (res.error) throw new Error(res.error.message);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🦷  Diagnosis migration — ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  // 1. Fetch all patients that have a treatments JSONB with teeth
  let offset = 0;
  const PAGE = 100;
  let totalPatients = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (true) {
    const { data: patients, error } = await supabase
      .from("patients")
      .select("id, treatments")
      .not("treatments", "is", null)
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("Failed to fetch patients:", error.message);
      break;
    }
    if (!patients || patients.length === 0) break;

    for (const patient of patients) {
      const patientUuid = patient.id;
      const teeth = patient.treatments?.teeth;
      if (!Array.isArray(teeth) || teeth.length === 0) continue;

      totalPatients++;

      for (const tooth of teeth) {
        const toothNumber = String(tooth?.toothId || tooth?.tooth_id || "").trim() || null;
        const diagList = [
          ...(Array.isArray(tooth?.diagnosis) ? tooth.diagnosis : []),
          ...(Array.isArray(tooth?.diagnoses) ? tooth.diagnoses : []),
        ];

        if (diagList.length === 0) continue;

        // Deduplicate within this tooth's list by code+description
        const seen = new Set();
        for (const diag of diagList) {
          const code = String(diag?.code || diag?.icd10_code || "").trim();
          const desc = String(diag?.description || diag?.icd10_description || "").trim();

          // Entry was mirrored from encounter_diagnoses — check if it already exists by ID
          const metaId = diag?.meta?.id;
          const metaSource = diag?.meta?.source;
          const metaEncounterId = diag?.meta?.encounter_id;

          if (metaSource === "encounter_diagnoses" && isUuid(metaId)) {
            // Verify it actually exists in the table
            const check = await supabase
              .from("encounter_diagnoses")
              .select("id")
              .eq("id", metaId)
              .maybeSingle();
            if (!check.error && check.data?.id) {
              totalSkipped++;
              continue; // Already in table
            }
            // It was supposed to exist but doesn't — fall through and re-insert
            console.log(`  ⚠  meta.id ${metaId} not found in encounter_diagnoses — will re-insert`);
          }

          if (!code && !desc) continue;

          const dedupeKey = `${toothNumber}__${code}__${desc}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          try {
            // Find or create a migration encounter for this patient
            const encounterId = isUuid(metaEncounterId)
              ? metaEncounterId
              : await findOrCreateMigrationEncounter(patientUuid);

            // Skip if already present (idempotent)
            const alreadyExists = await diagnosisAlreadyExists(encounterId, code, desc, toothNumber);
            if (alreadyExists) {
              totalSkipped++;
              continue;
            }

            const row = {
              encounter_id: encounterId,
              icd10_code: code || "Z01.20",
              icd10_description: desc || (code ? `ICD ${code}` : "Migrated diagnosis"),
              tooth_number: toothNumber ? Number(toothNumber) || toothNumber : null,
              notes: "Migrated from patients.treatments JSONB",
              is_primary: false,
              created_at: new Date().toISOString(),
            };

            await insertDiagnosis(row);
            totalInserted++;
            console.log(`  ✅ patient=${patientUuid} tooth=${toothNumber} code=${code} desc=${desc}`);
          } catch (err) {
            totalErrors++;
            console.error(`  ❌ patient=${patientUuid} tooth=${toothNumber}: ${err.message}`);
          }
        }
      }
    }

    offset += PAGE;
    if (patients.length < PAGE) break;
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`Patients processed : ${totalPatients}`);
  console.log(`Diagnoses inserted : ${totalInserted}`);
  console.log(`Diagnoses skipped  : ${totalSkipped} (already in table)`);
  console.log(`Errors             : ${totalErrors}`);
  if (DRY_RUN) console.log(`\n⚠  DRY RUN — nothing was actually written.`);
  console.log(`─────────────────────────────────────────\n`);
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
