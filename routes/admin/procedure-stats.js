// Backend API for monthly procedure aggregation for admin dashboard
const express = require('express');
const router = express.Router();
const { supabase } = require('../../supabase');
const { adminAuth } = require('../../server/middleware/auth');

// GET /api/admin/procedure-stats?year=YYYY
router.get('/procedure-stats', adminAuth, async (req, res) => {
  try {
    const clinicId = req.admin.clinicId;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    // Aggregate procedure counts by month for the given year
    const { data, error } = await supabase
      .rpc('get_monthly_procedure_counts', { p_clinic_id: clinicId, p_year: year });
    if (error) {
      console.error('[ADMIN PROCEDURE STATS] Error:', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[ADMIN PROCEDURE STATS] Fatal error:', err);
    res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

module.exports = router;
