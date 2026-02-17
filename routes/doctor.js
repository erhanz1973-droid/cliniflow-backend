const express = require('express');
const { supabase } = require('../lib/supabase');
const router = express.Router();

// Import individual doctor route modules
const treatmentRoutes = require('./doctor/treatments');
const suggestedProceduresRoutes = require('./doctor/suggested-procedures');

// Mount all doctor routes
router.use('/treatments', treatmentRoutes);
router.use('/suggested-procedures', suggestedProceduresRoutes);

// Add GET treatments route directly to main router
router.get('/encounters/:id/treatments', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('encounter_treatments')
      .select('*')
      .eq('encounter_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Treatments fetch error:', error);
      return res.status(500).json({ ok: false });
    }

    res.json({
      ok: true,
      treatments: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Add POST treatments route directly to main router
router.post('/encounters/:id/treatments', async (req, res) => {
  try {
    const { id } = req.params;
    const { tooth_number, procedure_name } = req.body;
    const doctorId = req.user.doctorId;

    const { data, error } = await supabase
      .from('encounter_treatments')
      .insert([
        {
          encounter_id: id,
          tooth_number,
          procedure_name,
          created_by_doctor_id: doctorId
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Treatment insert error:', error);
      return res.status(500).json({ ok: false });
    }

    res.json({
      ok: true,
      treatment: data
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

// Add GET suggested procedures route directly to main router
router.get('/diagnosis/:code/suggested-procedures', async (req, res) => {
  try {
    const { code } = req.params;
    const normalizedCode = code.toUpperCase().trim();

    const { data, error } = await supabase
      .from('diagnosis_procedure_suggestions')
      .select('procedure_name')
      .eq('icd10_code', normalizedCode)
      .order('priority', { ascending: true });

    if (error) {
      console.error('Suggested procedures fetch error:', error);
      return res.status(500).json({ ok: false });
    }

    const procedures = data.map(item => item.procedure_name);

    res.json({
      ok: true,
      procedures: procedures
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false });
  }
});

module.exports = router;
