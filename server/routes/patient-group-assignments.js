// server/routes/patient-group-assignments.js
const express = require('express');
const router = express.Router();

// Simple route for Render deployment
router.get('/', async (req, res) => {
  return res.json({ ok: true, message: 'Patient group assignments router working!' });
});

module.exports = router;
