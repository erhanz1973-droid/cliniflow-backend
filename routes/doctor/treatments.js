const express = require('express');
const router = express.Router();
const { supabase } = require('../../supabase');
const { authenticateToken } = require('../../server/middleware/auth');

console.log("DOCTOR TREATMENTS ROUTES LOADED");

/*
-------------------------------------------------------
GET treatments by encounter
-------------------------------------------------------
*/
router.get('/encounters/:id/treatments', authenticateToken, async (req, res) => {
  try {
    const encounterId = req.params.id;
    const start = Date.now();

    const { data, error } = await supabase
      .from('encounter_treatments')
      .select('id,tooth_number,procedure_name,status,created_by_doctor_id,created_at')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false });

    const duration = Date.now() - start;
    console.log('DB query duration: /encounters/:id/treatments', duration, 'ms');

    if (error) {
      console.error('[GET TREATMENTS ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    const treatments = (data || []).map(t => ({
      id: t.id,
      toothNumber: t.tooth_number,
      procedureName: t.procedure_name,
      status: t.status,
      doctorName: t.created_by_doctor_id,
      createdAt: t.created_at
    }));

    return res.json({ ok: true, treatments });

  } catch (err) {
    console.error('[GET TREATMENTS CRASH]', err);
    return res.status(500).json({ ok: false });
  }
});


/*
-------------------------------------------------------
GET notes by encounter
-------------------------------------------------------
*/
router.get('/encounters/:id/notes', authenticateToken, async (req, res) => {
  try {
    const encounterId = String(req.params.id || '').trim();

    if (!encounterId) {
      return res.status(400).json({ ok: false, error: 'encounter_id_required' });
    }

    const { data, error } = await supabase
      .from('encounter_notes')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET NOTES ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    const notes = (data || []).map(row => ({
      id: row.id,
      encounterId: row.encounter_id,
      doctorId: row.doctor_id,
      content: row.content,
      isEdited: row.is_edited,
      editedAt: row.edited_at,
      editedBy: row.edited_by,
      isCorrection: row.is_correction,
      correctionFor: row.correction_for,
      authorRole: row.author_role,
      createdAt: row.created_at
    }));

    return res.json({ ok: true, notes });

  } catch (error) {
    console.error('[GET NOTES CRASH]', error);
    return res.status(500).json({ ok: false });
  }
});


/*
-------------------------------------------------------
POST create treatment
-------------------------------------------------------
*/
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


/*
-------------------------------------------------------
PATCH update treatment
-------------------------------------------------------
*/
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
        status,
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


/*
-------------------------------------------------------
DELETE treatment
-------------------------------------------------------
*/
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