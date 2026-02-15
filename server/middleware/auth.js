// server/middleware/auth.js
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Authenticate token middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      console.error("[AUTHENTICATE TOKEN] JWT verification error:", err);
      return res.status(403).json({ error: 'Invalid token' });
    }

    console.log("[AUTHENTICATE TOKEN] Decoded token:", decoded);

    try {
      // 🔥 CRITICAL: Handle doctor tokens with role field
      if (decoded.role === "DOCTOR") {
        // Doctor tokens from login endpoint have role field
        req.decoded = decoded;
        req.user = {
          id: decoded.doctorId,
          role: decoded.role
        };
        console.log("[AUTHENTICATE TOKEN] Doctor user set:", { 
          decoded: req.decoded, 
          user: req.user 
        });
        return next();
      }

      // Get user info based on type (legacy tokens)
      let user;
      if (decoded.type === 'doctor') {
        const result = await pool.query('SELECT id, name, email FROM doctors WHERE id = $1', [decoded.id]);
        user = result.rows[0];
      } else if (decoded.type === 'admin') {
        const result = await pool.query('SELECT id, name, email FROM admins WHERE id = $1', [decoded.id]);
        user = result.rows[0];
      } else if (decoded.type === 'patient') {
        const result = await pool.query('SELECT id, name, phone FROM patients WHERE id = $1', [decoded.id]);
        user = result.rows[0];
      }

      if (!user) {
        return res.status(403).json({ error: 'User not found' });
      }

      req.user = { ...user, type: decoded.type };
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(500).json({ error: 'Authentication error' });
    }
  });
}

// Require doctor role middleware
function requireDoctor(req, res, next) {
  console.log("[REQUIRE DOCTOR] Checking user:", {
    user: req.user,
    decoded: req.decoded
  });

  // 🔥 CRITICAL: Check both role fields with case-insensitive comparison
  const role = req.user?.role || req.user?.type;
  const roleUpper = role?.toUpperCase();
  
  console.log("[REQUIRE DOCTOR] Role check:", {
    role,
    roleUpper,
    isDoctor: roleUpper === 'DOCTOR'
  });

  if (!role || roleUpper !== 'DOCTOR') {
    console.error("[REQUIRE DOCTOR] Access denied - not a doctor:", {
      role,
      roleUpper,
      expected: 'DOCTOR'
    });
    return res.status(403).json({ error: 'Doctor access required' });
  }

  console.log("[REQUIRE DOCTOR] Access granted for doctor");
  next();
}

// Require admin role middleware
function requireAdmin(req, res, next) {
  // 🔥 CRITICAL: Check both role fields with case-insensitive comparison
  const role = req.user?.role || req.user?.type;
  const roleUpper = role?.toUpperCase();
  
  if (!role || roleUpper !== 'ADMIN') {
    console.error("[REQUIRE ADMIN] Access denied - not an admin:", {
      role,
      roleUpper,
      expected: 'ADMIN'
    });
    return res.status(403).json({ error: 'Admin access required' });
  }

  console.log("[REQUIRE ADMIN] Access granted for admin");
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
