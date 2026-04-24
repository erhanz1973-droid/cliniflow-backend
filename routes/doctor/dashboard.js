const express = require('express');

const router = express.Router();

console.log('🔥 DOCTOR DASHBOARD ROUTE LOADED');

// GET /api/doctor/inbox-summary (primary for mobile) and GET /api/doctor/dashboard (alias) share
// handleDoctorInboxSummary in index.cjs. Registered *before* app.use("/api/doctor", this router).
// Do not add router.get("/dashboard", …) or router.get("/inbox-summary", …) here.

module.exports = router;
