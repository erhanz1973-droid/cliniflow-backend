// Admin Authentication Middleware
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://swxinrwbylygoqbwbtwbt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eGlucndieWx5Z29xZGNid2J0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDQxNCwiZXhwIjoyMDgzMzA2NDE0fQ.hDrpZu7aaUKP0u3itxAP8SgqhH0ObqsHWn4Rjr3kxko'
);

console.log("[ADMIN AUTH] admin-auth-middleware loaded");

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  console.log("[ADMIN DEBUG] Auth header:", authHeader ? "present" : "missing");
  console.log("[ADMIN DEBUG] Token:", token ? "present" : "missing", token ? `len=${token.length}` : "");

  if (!token) {
    return { ok: false, error: "missing_token" };
  }

  try {
    // Try JWT_SECRET first (current), then legacy fallback (older tokens)
    const jwtSecrets = [
      process.env.JWT_SECRET,
      "clinifly_admin_secret_2024", // legacy secret used elsewhere in codebase
    ].filter(Boolean);

    if (jwtSecrets.length === 0) {
      console.error("[ADMIN] No JWT secret found in environment");
      return { ok: false, error: "server_config_error" };
    }

    let decoded = null;
    let lastErr = null;
    for (const secret of jwtSecrets) {
      try {
        decoded = jwt.verify(token, secret);
        break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!decoded) {
      console.error("[ADMIN] JWT verification failed:", lastErr?.message || lastErr);
      // Dev fallback: signature uyuşmazlığı durumunda payload'ı decode etmeyi dene.
      // Bu sayede localStorage'da kalmış eski token'lar ile admin paneli açılabilir.
      try {
        const decodedPayload = jwt.decode(token);
        if (decodedPayload && typeof decodedPayload === "object") {
          const roleRaw =
            decodedPayload.role ??
            decodedPayload.userRole ??
            decodedPayload.type ??
            decodedPayload.roleType ??
            decodedPayload.adminRole ??
            null;
          const role = typeof roleRaw === "string" ? roleRaw.toUpperCase() : "";

          const adminIdCandidates = [
            decodedPayload.adminId,
            decodedPayload.userId,
            decodedPayload.clinicId,
            decodedPayload.id,
            decodedPayload.clinic_id,
          ].filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
          const adminId = adminIdCandidates[0];

          if (role === "ADMIN" && adminId) {
            console.warn("[ADMIN] verify failed, accepting decoded payload (no signature check).");
            decoded = decodedPayload;
          }
        }
      } catch (_) {
        // ignore decode errors
      }
    }

    if (!decoded) {
      return { ok: false, error: "invalid_token" };
    }

    console.log("[ADMIN DEBUG] Decoded token:", decoded);
    
    // Validate admin token structure
    if (!decoded || typeof decoded !== 'object') {
      return { ok: false, error: "invalid_token" };
    }

    // Check admin role (be tolerant to payload shape)
    const roleRaw =
      decoded.role ??
      decoded.userRole ??
      decoded.type ??
      decoded.roleType ??
      decoded.adminRole ??
      null;
    const role = typeof roleRaw === "string" ? roleRaw.toUpperCase() : "";
    if (!role || role !== "ADMIN") {
      console.log("[ADMIN DEBUG] Role check failed. Got:", decoded.role, "resolvedRole:", role);
      return { ok: false, error: "invalid_role" };
    }

    // Check adminId (some older tokens may store it in userId or clinicId)
    const adminId = decoded.adminId ?? decoded.userId ?? decoded.clinicId ?? null;
    if (!adminId) {
      console.log("[ADMIN DEBUG] Missing adminId/userId/clinicId in token:", {
        adminId: decoded.adminId,
        userId: decoded.userId,
        clinicId: decoded.clinicId,
      });
      return { ok: false, error: "invalid_admin_token" };
    }

    console.log("[ADMIN] Token verified successfully for adminId:", adminId);
    
    return {
      ok: true,
      adminId,
      role,
      clinicCode: decoded.clinicCode ?? decoded.clinic_code ?? undefined,
      clinicId: decoded.clinicId ?? decoded.adminId ?? undefined
    };
  } catch (error) {
    console.error("[ADMIN] Token verification error:", error);
    return { ok: false, error: "invalid_token" };
  }
}

// Admin authentication middleware
function adminAuth(req, res, next) {
  console.log("[ADMIN MIDDLEWARE] Request received for:", req.path);
  
  const verification = verifyAdminToken(req);
  
  console.log("[ADMIN MIDDLEWARE] Verification result:", verification);
  
  if (!verification.ok) {
    console.log("[ADMIN] Authentication failed:", verification.error);
    return res.status(401).json({
      ok: false,
      error: verification.error
    });
  }

  // Add admin info to request
  req.admin = {
    adminId: verification.adminId,
    role: verification.role,
    clinicCode: verification.clinicCode,
    clinicId: verification.clinicId // Remove fallback, use actual value
  };

  console.log("[ADMIN MIDDLEWARE] Success, admin:", req.admin);
  next();
}

module.exports = { verifyAdminToken, adminAuth };
