// Admin Authentication Middleware
function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  if (!token) {
    return { ok: false, error: "missing_token" };
  }

  try {
    // Use JWT_SECRET for all tokens (admin, doctor, patient)
    const adminSecret = process.env.JWT_SECRET;
    
    if (!adminSecret) {
      console.error("[ADMIN] No JWT_SECRET found in environment");
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
      clinicCode: decoded.clinicCode,
      clinicId: decoded.clinicId   // ✅ EKLE
    };
  } catch (error) {
    const code = error?.name === "TokenExpiredError" ? "token_expired" : "invalid_token";
    console.error("[ADMIN] Token verification error:", code, error?.message);
    return { ok: false, error: code };
  }
}

// Admin authentication middleware
function adminAuth(req, res, next) {
  const verification = verifyAdminToken(req);
  
  if (!verification.ok) {
    const status = verification.error === "invalid_role" ? 403 : 401;
    return res.status(status).json({ ok: false, error: verification.error });
  }

  // Add admin info to request
  req.admin = {
    adminId: verification.adminId,
    role: verification.role,
    clinicCode: verification.clinicCode,
    clinicId: verification.clinicId   // ✅ EKLE
  };

  next();
}

module.exports = { verifyAdminToken, adminAuth };
