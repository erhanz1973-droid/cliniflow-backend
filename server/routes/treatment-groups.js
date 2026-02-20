// server/routes/treatment-groups.js
const express = require('express');
const router = express.Router();

// Simple route for Render deployment
router.get('/', async (req, res) => {
  return res.json({ ok: true, message: 'Treatment groups router working!' });
});

module.exports = router;
