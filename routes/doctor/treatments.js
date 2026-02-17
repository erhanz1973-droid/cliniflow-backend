const express = require('express');
const { verifyDoctor } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');
const router = express.Router();

// GET treatments by encounter
router.get('/encounters/:id/treatments', verifyDoctor, async (req, res) => {
  try {
    const { id: encounterId } = req.params;
    const doctorId = req.user.id;

    // Verify encounter belongs to doctor
    const { data: encounterCheck, error: encounterError } = await supabase
      .from('encounters')
      .select('id')
      .eq('id', encounterId)
      .eq('doctor_id', doctorId)
      .single();

    if (encounterError || !encounterCheck) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Encounter not found or access denied' 
      });
    }

    // Get all treatments for this encounter
    const { data: treatments, error: treatmentsError } = await supabase
      .from('encounter_treatments')
      .select('*')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false });

    if (treatmentsError) {
      console.error('[TREATMENTS GET ERROR]', treatmentsError);
      return res.status(500).json({ 
        ok: false, 
        error: 'Failed to fetch treatments' 
      });
    }

    res.json({
      ok: true,
      treatments: treatments || []
    });
  } catch (error) {
    console.error('[TREATMENTS GET ERROR]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to fetch treatments' 
    });
  }
});

// POST create treatment
router.post('/encounters/:id/treatments', verifyDoctor, async (req, res) => {
  try {
    const { id: encounterId } = req.params;
    const { tooth_number, procedure_name } = req.body;
    const doctorId = req.user.id;

    // Validate required fields
    if (!tooth_number) {
      return res.status(400).json({ 
        ok: false, 
        error: 'tooth_number is required' 
      });
    }

    if (!procedure_name) {
      return res.status(400).json({ 
        ok: false, 
        error: 'procedure_name is required' 
      });
    }

    // Verify encounter belongs to doctor
    const { data: encounterCheck, error: encounterError } = await supabase
      .from('encounters')
      .select('id')
      .eq('id', encounterId)
      .eq('doctor_id', doctorId)
      .single();

    if (encounterError || !encounterCheck) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Encounter not found or access denied' 
      });
    }

    // Insert new treatment
    const { data: newTreatment, error: insertError } = await supabase
      .from('encounter_treatments')
      .insert({
        encounter_id: encounterId,
        tooth_number: tooth_number,
        procedure_name: procedure_name,
        status: 'planned',
        created_by_doctor_id: doctorId
      })
      .select()
      .single();

    if (insertError) {
      console.error('[TREATMENTS POST ERROR]', insertError);
      return res.status(500).json({ 
        ok: false, 
        error: 'Failed to create treatment' 
      });
    }

    res.json({
      ok: true,
      treatment: newTreatment
    });
  } catch (error) {
    console.error('[TREATMENTS POST ERROR]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to create treatment' 
    });
  }
});

// PATCH update treatment status
router.patch('/treatments/:treatmentId', verifyDoctor, async (req, res) => {
  try {
    const { treatmentId } = req.params;
    const { status } = req.body;
    const doctorId = req.user.id;

    // Validate status
    const allowedStatuses = ['planned', 'done', 'cancelled'];
    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Invalid status. Allowed values: planned, done, cancelled' 
      });
    }

    // Verify treatment belongs to doctor's encounter
    const { data: treatmentCheck, error: checkError } = await supabase
      .from('encounter_treatments')
      .select(`
        id,
        encounters!inner(
          id,
          doctor_id
        )
      `)
      .eq('id', treatmentId)
      .eq('encounters.doctor_id', doctorId)
      .single();

    if (checkError || !treatmentCheck) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Treatment not found or access denied' 
      });
    }

    // Update treatment status
    const { data: updatedTreatment, error: updateError } = await supabase
      .from('encounter_treatments')
      .update({ 
        status: status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', treatmentId)
      .select()
      .single();

    if (updateError) {
      console.error('[TREATMENTS PATCH ERROR]', updateError);
      return res.status(500).json({ 
        ok: false, 
        error: 'Failed to update treatment' 
      });
    }

    res.json({
      ok: true,
      treatment: updatedTreatment
    });
  } catch (error) {
    console.error('[TREATMENTS PATCH ERROR]', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to update treatment' 
    });
  }
});

module.exports = router;
