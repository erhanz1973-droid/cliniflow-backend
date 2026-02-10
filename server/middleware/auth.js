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
      return res.status(403).json({ error: 'Invalid token' });
    }

    try {
      // Get user info based on type
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
  if (req.user.type !== 'doctor') {
    return res.status(403).json({ error: 'Doctor access required' });
  }
  next();
}

// Require admin role middleware
function requireAdmin(req, res, next) {
  if (req.user.type !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
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
