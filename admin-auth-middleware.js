// Admin Authentication Middleware
const jwt = require("jsonwebtoken");

function getAdminJwtSecret() {
  const a = process.env.ADMIN_JWT_SECRET;
  const j = process.env.JWT_SECRET;
  const fromAdmin = a != null && String(a).trim() !== "" ? String(a).trim() : "";
  const fromJwt = j != null && String(j).trim() !== "" ? String(j).trim() : "";
  return fromAdmin || fromJwt;
}

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  console.log("[ADMIN DEBUG] Auth header:", authHeader ? "present" : "missing");
  console.log("[ADMIN DEBUG] Token:", token ? "present" : "missing");

  if (!token) {
    return { ok: false, error: "missing_token" };
  }

  try {
    const adminSecret = getAdminJwtSecret();

    if (!adminSecret) {
      console.error(
        "[ADMIN] No JWT secret: set JWT_SECRET or ADMIN_JWT_SECRET in the environment."
      );
      return { ok: false, error: "server_config_error" };
    }

    const decoded = jwt.verify(token, adminSecret);
    console.log("[ADMIN DEBUG] Decoded token:", decoded);

    if (!decoded || typeof decoded !== "object") {
      return { ok: false, error: "invalid_token" };
    }

    const normalizedRole = String(decoded.role || "").trim().toUpperCase();
    const hasClinicScope = !!(decoded.clinicId || decoded.clinicCode);
    const isLegacyAdminToken = hasClinicScope && !decoded.patientId;
    const hasValidRole = normalizedRole === "ADMIN" || (!normalizedRole && isLegacyAdminToken);
    if (!hasValidRole) {
      console.log("[ADMIN DEBUG] Role check failed. Got:", decoded.role);
      return { ok: false, error: "invalid_role" };
    }

    const effectiveAdminId = decoded.adminId || decoded.userId || decoded.clinicId || decoded.clinicCode;
    if (!effectiveAdminId) {
      return { ok: false, error: "invalid_admin_token" };
    }

    console.log("[ADMIN] Token verified successfully for adminId:", decoded.adminId);

    return {
      ok: true,
      adminId: effectiveAdminId,
      role: normalizedRole || "ADMIN",
      clinicCode: decoded.clinicCode,
      clinicId: decoded.clinicId,
    };
  } catch (error) {
    console.error("[ADMIN] Token verification error:", error);
    return { ok: false, error: "invalid_token" };
  }
}

function adminAuth(req, res, next) {
  console.log("[ADMIN MIDDLEWARE] Request received for:", req.path);

  const verification = verifyAdminToken(req);

  console.log("[ADMIN MIDDLEWARE] Verification result:", verification);

  if (!verification.ok) {
    console.log("[ADMIN] Authentication failed:", verification.error);
    return res.status(401).json({
      ok: false,
      error: verification.error,
    });
  }

  req.admin = {
    adminId: verification.adminId,
    role: verification.role,
    clinicCode: verification.clinicCode,
    clinicId: verification.clinicId,
  };

  console.log("[ADMIN MIDDLEWARE] Success, admin:", req.admin);
  next();
}

module.exports = { verifyAdminToken, adminAuth };
