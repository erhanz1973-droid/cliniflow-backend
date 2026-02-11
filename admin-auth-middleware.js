// Admin Authentication Middleware
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://swxinrwbylygoqbwbtwbt.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3eGlucndieWx5Z29xZGNid2J0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDQxNCwiZXhwIjoyMDgzMzA2NDE0fQ.hDrpZu7aaUKP0u3itxAP8SgqhH0ObqsHWn4Rjr3kxko'
);

function verifyAdminToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  console.log("[ADMIN DEBUG] Auth header:", authHeader ? "present" : "missing");
  console.log("[ADMIN DEBUG] Token:", token ? "present" : "missing");

  if (!token) {
    return { ok: false, error: "missing_token" };
  }

  try {
    // Use ADMIN_JWT_SECRET for admin tokens
    const adminSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    
    console.log("[ADMIN DEBUG] Admin secret:", adminSecret ? "present" : "missing");
    
    if (!adminSecret) {
      console.error("[ADMIN] No JWT secret found in environment");
      return { ok: false, error: "server_config_error" };
    }

    const decoded = jwt.verify(token, adminSecret);
    console.log("[ADMIN DEBUG] Decoded token:", decoded);
    
    // Validate admin token structure
    if (!decoded || typeof decoded !== 'object') {
      return { ok: false, error: "invalid_token" };
    }

    // Check admin role
    if (!decoded.role || decoded.role !== "ADMIN") {
      console.log("[ADMIN DEBUG] Role check failed. Got:", decoded.role);
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
      clinicId: decoded.clinicId || 1 // Fallback clinicId
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
    clinicId: verification.clinicId || 1 // Fallback clinicId
  };

  console.log("[ADMIN MIDDLEWARE] Success, admin:", req.admin);
  next();
}

module.exports = { verifyAdminToken, adminAuth };
