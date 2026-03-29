/**
 * run-migration.js — one-time migration runner for Cliniflow
 *
 * Creates the patient_files table in Supabase.
 *
 * Usage (two options):
 *
 * OPTION A — direct Postgres connection (fastest):
 *   SUPABASE_DB_URL=postgresql://postgres:[password]@db.swxinrwbylygoqdcbwbt.supabase.co:5432/postgres \
 *     node run-migration.js
 *
 *   Get your DB password from:
 *   https://supabase.com/dashboard/project/swxinrwbylygoqdcbwbt/settings/database
 *   (Settings → Database → Connection string → URI)
 *
 * OPTION B — Supabase REST API (no DB password needed):
 *   Just run: node run-migration.js
 *   The script will print the SQL to paste into the Supabase SQL Editor at:
 *   https://supabase.com/dashboard/project/swxinrwbylygoqdcbwbt/sql
 */

require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const SUPABASE_URL            = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_URL         = process.env.SUPABASE_DB_URL;

const SQL = `
CREATE TABLE IF NOT EXISTS patient_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL,
  clinic_id    UUID NOT NULL,
  file_url     TEXT NOT NULL,
  file_name    TEXT NOT NULL DEFAULT '',
  file_type    TEXT NOT NULL DEFAULT 'image',
  file_subtype TEXT,
  mime_type    TEXT,
  file_size    INTEGER,
  from_role    TEXT NOT NULL DEFAULT 'patient',
  source       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_files_patient_id ON patient_files (patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_files_clinic_id  ON patient_files (clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_files_type       ON patient_files (patient_id, file_type);
`.trim();

async function runViaPg() {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    console.log("Connecting via pg…");
    await pool.query(SQL);
    console.log("✅  patient_files table created (or already existed).");
  } finally {
    await pool.end();
  }
}

async function checkViaRest() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env");
    process.exit(1);
  }
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from("patient_files").select("id").limit(1);
  return !error;
}

async function main() {
  console.log("=== Cliniflow Migration Runner ===\n");

  if (SUPABASE_DB_URL) {
    await runViaPg();
    return;
  }

  // No DB URL — check via REST then print SQL
  console.log("SUPABASE_DB_URL not set — checking table via REST API…");
  const exists = await checkViaRest();

  if (exists) {
    console.log("✅  patient_files table already exists — nothing to do.");
    return;
  }

  console.log("\n⚠️  patient_files table NOT found.\n");
  console.log("Run the following SQL in the Supabase SQL Editor:");
  console.log("  https://supabase.com/dashboard/project/swxinrwbylygoqdcbwbt/sql\n");
  console.log("─".repeat(60));
  console.log(SQL);
  console.log("─".repeat(60));
  console.log("\nAlternatively, set SUPABASE_DB_URL in .env and re-run this script.");
  console.log("Get your DB URL from:");
  console.log("  https://supabase.com/dashboard/project/swxinrwbylygoqdcbwbt/settings/database");
  process.exit(1);
}

main().catch(err => {
  console.error("Migration error:", err.message);
  process.exit(1);
});
