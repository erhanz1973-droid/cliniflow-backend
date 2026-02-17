const express = require('express');
const { verifyDoctor } = require('../../middleware/auth');
const { secureGet, securePost, securePatch } = require('../../lib/secure-fetch');
const router = express.Router();

// GET treatments by encounter
router.get('/encounters/:id/treatments', verifyDoctor, async (req, res) => {
  try {
    const { id: encounterId } = req.params;
    const doctorId = req.user.id;

    // Verify encounter belongs to doctor
    const encounterCheck = await secureGet(
      'SELECT id FROM encounters WHERE id = $1 AND doctor_id = $2',
      [encounterId, doctorId]
    );

    if (!encounterCheck || encounterCheck.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Encounter not found or access denied' 
      });
    }

    // Get all treatments for this encounter
    const treatments = await secureGet(
      'SELECT * FROM encounter_treatments WHERE encounter_id = $1 ORDER BY created_at DESC',
      [encounterId]
    );

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
    const encounterCheck = await secureGet(
      'SELECT id FROM encounters WHERE id = $1 AND doctor_id = $2',
      [encounterId, doctorId]
    );

    if (!encounterCheck || encounterCheck.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Encounter not found or access denied' 
      });
    }

    // Insert new treatment
    const newTreatment = await securePost(
      'INSERT INTO encounter_treatments (encounter_id, tooth_number, procedure_name, status, created_by_doctor_id) VALUES ($1, $2, $3, \'planned\', $4) RETURNING *',
      [encounterId, tooth_number, procedure_name, doctorId]
    );

    res.json({
      ok: true,
      treatment: newTreatment[0]
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
    const treatmentCheck = await secureGet(
      `SELECT t.id FROM encounter_treatments t
       JOIN encounters e ON t.encounter_id = e.id
       WHERE t.id = $1 AND e.doctor_id = $2`,
      [treatmentId, doctorId]
    );

    if (!treatmentCheck || treatmentCheck.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Treatment not found or access denied' 
      });
    }

    // Update treatment status
    const updatedTreatment = await securePatch(
      'UPDATE encounter_treatments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, treatmentId]
    );

    res.json({
      ok: true,
      treatment: updatedTreatment[0]
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
