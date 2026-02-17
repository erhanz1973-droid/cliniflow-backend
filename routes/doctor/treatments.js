const express = require('express');
const router = express.Router();
const { supabase } = require('../../supabase');
const { authenticateToken } = require('../../server/middleware/auth');

// GET treatments by encounter
router.get('/encounters/:id/treatments', authenticateToken, async (req, res) => {
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

// POST create treatment
router.post('/encounters/:id/treatments', authenticateToken, async (req, res) => {
  try {
    const encounterId = req.params.id;
    const { tooth_number, procedure_name } = req.body;
    const doctorId = req.user?.id || req.user?.doctorId;

    if (!tooth_number || !procedure_name) {
      return res.status(400).json({ 
        ok: false, 
        error: 'tooth_number and procedure_name are required' 
      });
    }

    const { data, error } = await supabase
      .from('encounter_treatments')
      .insert({
        encounter_id: encounterId,
        tooth_number,
        procedure_name,
        status: 'planned',
        created_by_doctor_id: doctorId
      })
      .select()
      .single();

    if (error) {
      console.error('[POST TREATMENT ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    return res.json({ ok: true, treatment: data });

  } catch (err) {
    console.error('[POST TREATMENT CRASH]', err);
    return res.status(500).json({ ok: false });
  }
});

// PATCH update treatment
router.patch('/treatments/:treatmentId', authenticateToken, async (req, res) => {
  try {
    const { treatmentId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ 
        ok: false, 
        error: 'status is required' 
      });
    }

    const { data, error } = await supabase
      .from('encounter_treatments')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', treatmentId)
      .select()
      .single();

    if (error) {
      console.error('[PATCH TREATMENT ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    return res.json({ ok: true, treatment: data });

  } catch (err) {
    console.error('[PATCH TREATMENT CRASH]', err);
    return res.status(500).json({ ok: false });
  }
});

// DELETE treatment
router.delete('/treatments/:treatmentId', authenticateToken, async (req, res) => {
  try {
    const { treatmentId } = req.params;

    const { error } = await supabase
      .from('encounter_treatments')
      .delete()
      .eq('id', treatmentId);

    if (error) {
      console.error('[DELETE TREATMENT ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    return res.json({ ok: true });

  } catch (err) {
    console.error('[DELETE TREATMENT CRASH]', err);
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;
