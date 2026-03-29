// routes/doctor/procedures.js
// NOTE: This route is NOT mounted — GET /api/doctor/procedures is handled by
// routes/doctor/treatments.js which is mounted at /api/doctor.
// Kept here as a stub to prevent accidental re-introduction of the legacy
// procedures table dependency.

const path = require('path');
const express = require('express');
const router = express.Router();
const {
  buildProceduresCatalogPayload,
  trySendProceduresCatalog304,
} = require('@cliniflow/procedures');
const { appPath } = require(path.join(__dirname, '..', '..', 'lib', 'appRoot.cjs'));
const { authenticateToken } = require(appPath('server', 'middleware', 'auth'));

// Returns canonical catalog (same shape as GET /api/procedures) — no DB.
router.get('/procedures', authenticateToken, (req, res) => {
  const payload = buildProceduresCatalogPayload(req.query.lang);
  res.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
  if (trySendProceduresCatalog304(req, res, payload)) return;
  return res.json(payload);
});

module.exports = router;
