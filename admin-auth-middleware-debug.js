// Admin Authentication Middleware - Debug Version
const jwt = require('jsonwebtoken');

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  
  console.log("[ADMIN DEBUG] Raw Authorization header:", authHeader);
  console.log("[ADMIN DEBUG] Token extracted:", token ? token.substring(0, 50) + "..." : "none");
  
  if (!token) {
    console.log("[ADMIN DEBUG] No token found");
    return { ok: false, error: "missing_token" };
  }

  try {
    // Use JWT_SECRET for all tokens (admin, doctor, patient)
    const adminSecret = process.env.JWT_SECRET;
    console.log("[ADMIN DEBUG] Using JWT_SECRET:", adminSecret ? "SET" : "NOT SET");
    
    if (!adminSecret) {
      console.error("[ADMIN DEBUG] No JWT secret found in environment");
      return { ok: false, error: "server_config_error" };
    }

    console.log("[ADMIN DEBUG] Verifying token with JWT_SECRET");
    
    const decoded = jwt.verify(token, adminSecret);
    console.log("[ADMIN DEBUG] Token decoded successfully:", decoded);
    
    // Validate admin token structure
    if (!decoded || typeof decoded !== 'object') {
      console.log("[ADMIN DEBUG] Invalid token structure");
      return { ok: false, error: "invalid_token" };
    }

    // Check admin role (case-insensitive)
    if (!decoded.role || decoded.role.toLowerCase() !== 'admin') {
      console.log("[ADMIN DEBUG] Invalid role:", decoded.role);
      return { ok: false, error: "invalid_role" };
    }

    // Check adminId (not userId)
    if (!decoded.adminId) {
      console.log("[ADMIN DEBUG] Invalid adminId");
      return { ok: false, error: "invalid_admin_token" };
    }

    console.log("[ADMIN DEBUG] Token verified successfully for adminId:", decoded.adminId);
    
    return {
      ok: true,
      adminId: decoded.adminId,
      role: decoded.role,
      clinicCode: decoded.clinicCode
    };
  } catch (error) {
    console.error("[ADMIN DEBUG] Token verification error:", error);
    console.log("[ADMIN DEBUG] Error details:", {
      message: error.message,
      stack: error.stack
    });
    return { ok: false, error: "invalid_token" };
  }
}

function adminAuth(req, res, next) {
  console.log("[ADMIN DEBUG] Admin auth middleware hit");
  const verification = verifyAdminToken(req);
  
  if (!verification.ok) {
    console.log("[ADMIN DEBUG] Authentication failed:", verification.error);
    return res.status(401).json({
      ok: false,
      error: verification.error
    });
  }

  // Add admin info to request
  req.admin = {
    adminId: verification.adminId,
    role: verification.role,
    clinicCode: verification.clinicCode
  };

  console.log("[ADMIN DEBUG] Admin info attached to request:", req.admin);
  next();
}

module.exports = { verifyAdminToken, adminAuth };
