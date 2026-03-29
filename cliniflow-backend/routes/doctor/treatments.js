const express = require('express');
const router = express.Router();
const { supabase } = require('../../lib/supabase');
const { authenticateToken } = require('../../server/middleware/auth');
const {
  PROCEDURE_TYPES,
  EXTRACTION_TYPES,
  CATEGORIES,
  STATUSES,
  buildProceduresCatalogPayload,
  trySendProceduresCatalog304,
} = require('@cliniflow/procedures');

/*
UPDATE treatment
PUT /api/doctor/treatments/:id
*/
router.put('/treatments/:id', authenticateToken, async (req, res) => {
  try {
    const treatmentId = req.params.id;
    const { status, chair, assigned_doctor_id, scheduled_at } = req.body || {};

    const { data, error } = await supabase
      .from('encounter_treatments')
      .update({
        status,
        chair,
        assigned_doctor_id,
        scheduled_at
      })
      .eq('id', treatmentId)
      .select()
      .single();

    if (error) {
      console.error('[UPDATE TREATMENT ERROR]', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    res.json({
      ok: true,
      treatment: data
    });

  } catch (err) {
    console.error('[UPDATE TREATMENT CRASH]', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
/*
-------------------------------------------------------
PUT update treatment by id
-------------------------------------------------------
*/
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, chair, assigned_doctor_id, scheduled_at } = req.body;

    const updateFields = {};
    if (status !== undefined) updateFields.status = status;
    if (chair !== undefined) updateFields.chair = chair;
    if (assigned_doctor_id !== undefined) updateFields.assigned_doctor_id = assigned_doctor_id;
    if (scheduled_at !== undefined) updateFields.scheduled_at = scheduled_at;

    const { data, error } = await supabase
      .from('encounter_treatments')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Treatment update error:', error);
      return res.status(500).json({ ok: false, error: 'update_failed' });
    }
    if (!data) {
      return res.status(404).json({ ok: false, error: 'treatment_not_found' });
    }
    res.json({ ok: true, treatment: data });
  } catch (err) {
    console.error('Treatment update error:', err);
    res.status(500).json({ ok: false, error: 'update_failed' });
  }
});
/*
-------------------------------------------------------
PUT update treatment
-------------------------------------------------------
*/
router.put('/treatments/:treatmentId', authenticateToken, async (req, res) => {
  try {
    const { treatmentId } = req.params;
    const { status, chair, assigned_doctor_id, scheduled_at } = req.body || {};

    if (!status) {
      return res.status(400).json({
        ok: false,
        error: 'status is required'
      });
    }

    const updateFields = { status };
    if (chair !== undefined) updateFields.chair = chair;
    if (assigned_doctor_id !== undefined) updateFields.assigned_doctor_id = assigned_doctor_id;
    if (scheduled_at !== undefined) updateFields.scheduled_at = scheduled_at;

    const { data, error } = await supabase
      .from('encounter_treatments')
      .update(updateFields)
      .eq('id', treatmentId)
      .select()
      .single();

    if (error) {
      console.error('[PUT TREATMENT ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    return res.json({ ok: true, treatment: data });

  } catch (err) {
    console.error('[PUT TREATMENT CRASH]', err);
    return res.status(500).json({ ok: false });
  }
});
// --- GET /api/doctor/procedures ---
// FIX: was '/api/doctor/procedures' (double-prefix bug — resolved to /api/doctor/api/doctor/procedures).
// Now correctly '/procedures' so mount at /api/doctor gives /api/doctor/procedures.
// Same payload + ETag as GET /api/procedures (@cliniflow/procedures).
const VALID_LANGS = ['en', 'tr', 'ru', 'ka'];
function localizeLabel(p, lang) {
  return (p.labels && p.labels[lang]) ? p.labels[lang] : p.label;
}
router.get('/procedures', authenticateToken, async (req, res) => {
  try {
    const payload = buildProceduresCatalogPayload(req.query.lang);
    res.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
    if (trySendProceduresCatalog304(req, res, payload)) return;
    return res.json(payload);
  } catch (err) {
    console.error('[GET PROCEDURES CRASH]', err);
    return res.status(500).json({ ok: false });
  }
});
// Build a lookup map from canonical type → label for enriching responses
const TYPE_TO_LABEL = Object.fromEntries(PROCEDURE_TYPES.map(p => [p.type, p.label]));
function buildTypeLabelMap(lang) {
  return Object.fromEntries(PROCEDURE_TYPES.map(p => [p.type, localizeLabel(p, lang)]));
}
const VALID_PROCEDURE_TYPES = new Set(PROCEDURE_TYPES.map(p => p.type));

/*
-------------------------------------------------------
GET treatment plan by encounter
-------------------------------------------------------
*/
router.get('/encounters/:id/plan', authenticateToken, async (req, res) => {
  try {
    const encounterId = req.params.id;
    const lang = VALID_LANGS.includes(req.query.lang) ? req.query.lang : 'en';
    const TYPE_TO_LABEL_LANG = buildTypeLabelMap(lang);

    const { data, error } = await supabase
      .from('encounter_treatments')
      .select('id, encounter_id, tooth_number, procedure_id, status, assigned_doctor_id, chair, scheduled_at, created_at')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[PLAN QUERY ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    // Backfill procedure names for legacy rows that only have procedure_id (no procedure_type)
    const legacyIds = [...new Set((data || []).filter(t => !t.procedure_type && t.procedure_id).map(t => t.procedure_id))];
    const procMap = new Map();
    if (legacyIds.length > 0) {
      const { data: procs } = await supabase.from('procedures').select('id, name').in('id', legacyIds);
      (procs || []).forEach(p => procMap.set(p.id, p.name));
    }

    const plan = (data || []).map(t => {
      const typeName = t.procedure_type || procMap.get(t.procedure_id) || t.procedure_id || 'UNKNOWN';
      return {
        ...t,
        procedure: { type: typeName, name: TYPE_TO_LABEL_LANG[typeName] || typeName },
      };
    });

    return res.json({ ok: true, plan });
  } catch (err) {
    console.error('[PLAN ROUTE CRASH]', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

/*
-------------------------------------------------------
GET treatments by encounter
-------------------------------------------------------
*/
router.get('/encounters/:id/treatments', authenticateToken, async (req, res) => {
  try {
    const encounterId = req.params.id;
    const clinicId = req.user?.clinicId;
    const lang = VALID_LANGS.includes(req.query.lang) ? req.query.lang : 'en';
    const TYPE_TO_LABEL_LANG = buildTypeLabelMap(lang);

    const { data, error } = await supabase
      .from('encounter_treatments')
      .select('id, tooth_number, procedure_id, status, assigned_doctor_id, chair, scheduled_at, created_at')
      .eq('encounter_id', encounterId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET TREATMENTS ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    // Backfill procedure names for legacy rows that only have procedure_id (no procedure_type)
    const legacyIds = [...new Set((data || []).filter(t => !t.procedure_type && t.procedure_id).map(t => t.procedure_id))];
    const procMap = new Map();
    if (legacyIds.length > 0) {
      const { data: procs } = await supabase.from('procedures').select('id, name').in('id', legacyIds);
      (procs || []).forEach(p => procMap.set(p.id, p.name));
    }

    // Resolve canonical type name for each treatment
    const resolvedTypes = (data || []).map(t => t.procedure_type || procMap.get(t.procedure_id) || t.procedure_id || 'UNKNOWN');

    // Fetch prices for all resolved types in one query
    const usedTypes = [...new Set(resolvedTypes.filter(Boolean))];
    let priceMap = {};
    if (usedTypes.length > 0 && clinicId) {
      const { data: prices } = await supabase
        .from('treatment_prices')
        .select('type, price, currency')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .in('type', usedTypes);
      (prices || []).forEach(p => { priceMap[p.type] = { price: p.price, currency: p.currency }; });
    }

    const treatments = (data || []).map((t, i) => {
      const typeName = resolvedTypes[i];
      return {
        ...t,
        procedure_type: typeName,
        procedure: { type: typeName, name: TYPE_TO_LABEL_LANG[typeName] || typeName },
        price: priceMap[typeName] || null,
      };
    });

    return res.json({
      ok: true,
      treatments,
      deprecations: {
        procedure_id_on_encounter_treatments:
          'Prefer procedure_type for catalog alignment; procedure_id is legacy and will be removed in a future API version.',
      },
    });

  } catch (err) {
    console.error('[GET TREATMENTS CRASH]', err);
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
    let { tooth_number, procedure_type, procedure_id, chair, scheduled_at } = req.body || {};
    const doctorId = req.user?.id || req.user?.doctorId;
    const clinicId = req.user?.clinicId;

    // Accept procedure_type or procedure_id (legacy field name) — both carry the type string
    const procType = String(procedure_type || procedure_id || '').toUpperCase().trim();

    // Validate tooth_number (FDI notation: 11–18, 21–28, 31–38, 41–48)
    if (typeof tooth_number === 'string') tooth_number = Number(tooth_number);
    if (typeof tooth_number !== 'number' || tooth_number < 11 || tooth_number > 48) {
      return res.status(400).json({ ok: false, error: 'Invalid tooth_number (expected FDI 11–48)' });
    }

    // Validate procedure_type against canonical list — no DB lookup
    if (!procType || !VALID_PROCEDURE_TYPES.has(procType)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid procedure_type',
        valid_types: [...VALID_PROCEDURE_TYPES],
      });
    }

    // Resolve to procedure_id FK — find by name or auto-create
    let resolvedProcedureId = null;
    const procNameLookup = procType.replace(/_/g, ' ');
    const { data: procRow } = await supabase
      .from('procedures')
      .select('id, name')
      .ilike('name', procNameLookup)
      .limit(1)
      .maybeSingle();

    if (procRow) {
      resolvedProcedureId = procRow.id;
    } else {
      // Auto-create procedure if not found
      const procLabel = TYPE_TO_LABEL[procType] || procNameLookup
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      const { data: newProc } = await supabase
        .from('procedures')
        .insert({ name: procLabel, category: 'General' })
        .select('id')
        .single();
      if (newProc) resolvedProcedureId = newProc.id;
    }

    if (!resolvedProcedureId) {
      return res.status(500).json({ ok: false, error: 'procedure_lookup_failed' });
    }

    const insertPayload = {
      assigned_doctor_id: doctorId,
      encounter_id: encounterId,
      tooth_number,
      procedure_id: resolvedProcedureId,
      status: 'planned',
      created_by_doctor_id: doctorId,
      ...(chair && { chair: String(chair) }),
      ...(scheduled_at && { scheduled_at: new Date(scheduled_at).toISOString() }),
    };

    const { data, error } = await supabase
      .from('encounter_treatments')
      .insert(insertPayload)
      .select('id, encounter_id, tooth_number, procedure_id, status, created_at')
      .single();

    if (error) {
      console.error('[POST TREATMENT ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error' });
    }

    // Look up price from treatment_prices
    let price = null;
    if (clinicId) {
      const { data: priceRow } = await supabase
        .from('treatment_prices')
        .select('price, currency')
        .eq('clinic_id', clinicId)
        .eq('type', procType)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (priceRow) price = { price: priceRow.price, currency: priceRow.currency };
    }

    return res.json({
      ok: true,
      treatment: {
        ...data,
        procedure: { type: procType, name: TYPE_TO_LABEL[procType] || procType },
        price,
      },
    });

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
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({
        ok: false,
        error: 'status is required'
      });
    }

    const { data, error } = await supabase
      .from('encounter_treatments')
      .update({ status })
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