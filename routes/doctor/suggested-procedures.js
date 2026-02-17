const express = require('express');
const { verifyDoctor } = require('../../middleware/auth');
const { supabase } = require('../../lib/supabase');
const router = express.Router();

// GET suggested procedures for diagnosis code
router.get('/diagnosis/:code/suggested-procedures', verifyDoctor, async (req, res) => {
  try {
    const { code } = req.params;
    const doctorId = req.user.id;

    // Normalize diagnosis code (uppercase, trim)
    const normalizedCode = code ? code.toUpperCase().trim() : '';

    if (!normalizedCode) {
      return res.json({
        ok: true,
        procedures: []
      });
    }

    // Fetch suggested procedures from database
    const { data: procedures, error: fetchError } = await supabase
      .from('diagnosis_procedure_suggestions')
      .select('procedure_name')
      .eq('icd10_code', normalizedCode)
      .order('priority', { ascending: true });

    if (fetchError) {
      console.error('[SUGGESTED PROCEDURES ERROR]', fetchError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to fetch suggested procedures'
      });
    }

    // Extract procedure names from results
    const procedureNames = procedures ? procedures.map(p => p.procedure_name) : [];

    res.json({
      ok: true,
      procedures: procedureNames
    });

  } catch (error) {
    console.error('[SUGGESTED PROCEDURES ERROR]', error);
    res.status(500).json({
      ok: false,
      error: 'Failed to fetch suggested procedures'
    });
  }
});

module.exports = router;
