// server/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

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

    console.log("[AUTHENTICATE TOKEN] Decoded token:", decoded);

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
        console.log("[AUTHENTICATE TOKEN] Doctor user set:", { user: req.user });
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
  console.log("[REQUIRE DOCTOR] Checking user:", req.user);

  // 🔥 KRİTİK: Sadece DB'den gelen role alanını kontrol et
  if (!req.user || req.user.role !== 'DOCTOR') {
    console.error("[REQUIRE DOCTOR] Access denied - not a doctor:", {
      role: req.user?.role,
      expected: 'DOCTOR'
    });
    return res.status(403).json({ error: 'Doctor access required' });
  }

  console.log("[REQUIRE DOCTOR] Access granted for doctor:", {
    id: req.user.id,
    email: req.user.email
  });
  next();
}

// Require admin role middleware
function requireAdmin(req, res, next) {
  console.log("[REQUIRE ADMIN] Checking user:", req.user);

  // 🔥 KRİTİK: Sadece DB'den gelen role alanını kontrol et
  if (!req.user || req.user.role !== 'ADMIN') {
    console.error("[REQUIRE ADMIN] Access denied - not an admin:", {
      role: req.user?.role,
      expected: 'ADMIN'
    });
    return res.status(403).json({ error: 'Admin access required' });
  }

  console.log("[REQUIRE ADMIN] Access granted for admin:", {
    id: req.user.id,
    email: req.user.email
  });
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
