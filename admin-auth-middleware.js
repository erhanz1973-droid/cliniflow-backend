// Admin Authentication Middleware
function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return { ok: false, error: "missing_token" };
  }

  try {
    // Use ADMIN_JWT_SECRET for admin tokens
    const adminSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    
    if (!adminSecret) {
      console.error("[ADMIN] No JWT secret found in environment");
      return { ok: false, error: "server_config_error" };
    }

    const decoded = jwt.verify(token, adminSecret);
    
    // Validate admin token structure
    if (!decoded || typeof decoded !== 'object') {
      return { ok: false, error: "invalid_token" };
    }

    // Check admin role (case-insensitive)
    if (!decoded.role || decoded.role.toLowerCase() !== 'admin') {
      return { ok: false, error: "invalid_role" };
    }

    // Check adminId (not userId)
    if (!decoded.adminId) {
      return { ok: false, error: "invalid_admin_token" };
    }

    console.log("[ADMIN] Token verified successfully for adminId:", decoded.adminId);
    
    return {
      ok: true,
      adminId: decoded.adminId,
      role: decoded.role,
      clinicCode: decoded.clinicCode
    };
  } catch (error) {
    console.error("[ADMIN] Token verification error:", error);
    return { ok: false, error: "invalid_token" };
  }
}

// Admin authentication middleware
function adminAuth(req, res, next) {
  const verification = verifyAdminToken(req);
  
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
    clinicCode: verification.clinicCode
  };

  next();
}

module.exports = { verifyAdminToken, adminAuth };
