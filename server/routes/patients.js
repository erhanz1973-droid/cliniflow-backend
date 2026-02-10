// server/routes/patients.js
const express = require('express');
const router = express.Router();
const { authenticateAdmin } = require('../middleware/auth');

// Middleware - Admin only
router.use(authenticateAdmin);

// GET /api/patients - Get all patients
router.get('/', async (req, res) => {
  try {
    // For now, return empty array - would need to implement Patient model
    res.json({
      ok: true,
      patients: []
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      ok: false,
      error: 'Hastalar yüklenemedi'
    });
  }
});

module.exports = router;
