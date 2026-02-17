const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const verifyDoctor = require('../../middleware/auth');

router.get('/encounters/:id/treatments', verifyDoctor, async (req, res) => {
  try {
    const encounterId = req.params.id;

    const { data, error } = await supabase
      .from('encounter_treatments')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET TREATMENTS ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    return res.json({ ok: true, treatments: data });

  } catch (err) {
    console.error('[GET TREATMENTS CRASH]', err);
    return res.status(500).json({ ok: false });
  }
});

// Test route to verify mounting
router.get('/test', (req, res) => {
  console.log('[TREATMENTS TEST ROUTE] - Treatments route is properly mounted!');
  return res.json({ ok: true, message: 'Treatments route is working!' });
});

module.exports = router;
