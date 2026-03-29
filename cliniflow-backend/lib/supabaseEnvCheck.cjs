/**
 * SUPABASE_URL / key sanity check — fails fast on obvious placeholders
 * (avoids cryptic ENOTFOUND dummy.supabase.co at runtime).
 */

function validateSupabaseEnvOrExit() {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!url || !key) {
    console.error(
      "\n❌ [SUPABASE] SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY zorunludur.\n" +
        "   cliniflow-backend/.env dosyasını doldurun; örnek: .env.example\n"
    );
    process.exit(1);
  }

  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    console.error("\n❌ [SUPABASE] SUPABASE_URL geçerli bir URL değil:", url, "\n");
    process.exit(1);
  }

  const urlLower = url.toLowerCase();
  const looksPlaceholder =
    hostname === "dummy.supabase.co" ||
    /placeholder|your[_-]?supabase|your[_-]?project|example\.com/i.test(
      urlLower
    ) ||
    /^https?:\/\/[^/]*your-/i.test(urlLower);

  if (looksPlaceholder) {
    console.error("\n❌ [SUPABASE] SUPABASE_URL placeholder / sahte görünüyor:");
    console.error("   ", url);
    console.error(
      "\n   Supabase Dashboard → Project Settings → API → Project URL değerini kullanın."
    );
    console.error(
      "   cliniflow-backend/.env içinde dummy.supabase.co bırakmayın.\n"
    );
    process.exit(1);
  }

  if (key.length < 32 || key === "dummy") {
    console.error(
      "\n❌ [SUPABASE] SUPABASE_SERVICE_ROLE_KEY geçersiz veya placeholder.\n" +
        "   Dashboard → API → service_role (secret) anahtarını kopyalayın.\n"
    );
    process.exit(1);
  }

  try {
    console.log("[SUPABASE] OK — host:", new URL(url).hostname);
  } catch {
    /* unreachable */
  }
}

module.exports = { validateSupabaseEnvOrExit };
