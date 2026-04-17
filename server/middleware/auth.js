// server/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_TOKEN_DEBUG = String(process.env.DOCTOR_AUTH_DEBUG || process.env.AUTH_TOKEN_DEBUG || "").trim() === "1";

if (!JWT_SECRET) {
  console.error("❌ FATAL: JWT_SECRET is not defined in environment variables");
  process.exit(1);
}

// Authenticate token middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("[AUTHENTICATE TOKEN] JWT verification error:", err);
      return res.status(403).json({ error: 'Invalid token' });
    }

    if (AUTH_TOKEN_DEBUG) console.log("[AUTHENTICATE TOKEN] decoded role:", decoded?.role);

    try {
      req.decoded = decoded;

      const roleNorm = String(decoded.role || decoded.roleType || "").toUpperCase();
      if (roleNorm === "DOCTOR" || decoded.doctorId) {
        req.user = {
          id: decoded.doctorId || decoded.id,
          email: decoded.email,
          role: "DOCTOR",
          clinicId: decoded.clinicId || null,
          clinicCode: decoded.clinicCode || null,
        };
        if (AUTH_TOKEN_DEBUG) console.log("[AUTHENTICATE TOKEN] doctor ok id:", req.user.id);
        return next();
      }

      if (roleNorm === "PATIENT" || decoded.patientId) {
        req.user = {
          id: decoded.patientId || decoded.id,
          email: decoded.email,
          role: "PATIENT",
          clinicId: decoded.clinicId || null,
          clinicCode: decoded.clinicCode || null,
        };
        return next();
      }

      if (roleNorm === "ADMIN" || decoded.adminId) {
        req.user = {
          id: decoded.adminId || decoded.id,
          email: decoded.email,
          role: "ADMIN",
          clinicId: decoded.clinicId || null,
        };
        return next();
      }

      req.user = {
        id: decoded.adminId || decoded.doctorId || decoded.patientId || decoded.id,
        email: decoded.email,
        role: decoded.role || "USER",
        clinicId: decoded.clinicId || null,
        clinicCode: decoded.clinicCode || null,
      };
      next();
    } catch (error) {
      console.error("Auth middleware error:", error);
      res.status(500).json({ error: "Authentication error" });
    }
  });
}

// Require doctor role middleware
function requireDoctor(req, res, next) {
  if (!req.user || req.user.role !== "DOCTOR") {
    if (AUTH_TOKEN_DEBUG) {
      console.error("[REQUIRE DOCTOR] denied role:", req.user?.role);
    }
    return res.status(403).json({ error: "Doctor access required" });
  }
  next();
}

// Require admin role middleware
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    if (AUTH_TOKEN_DEBUG) {
      console.error("[REQUIRE ADMIN] denied role:", req.user?.role);
    }
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Authenticate admin middleware (token + admin role)
function authenticateAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    requireAdmin(req, res, next);
  });
}

module.exports = {
  authenticateToken,
  requireDoctor,
  requireAdmin,
  authenticateAdmin
};
