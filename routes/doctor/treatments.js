const express = require('express');
const router = express.Router();
const { supabase } = require('../../supabase');
const { authenticateToken } = require('../../server/middleware/auth');
const { getProcedureLabel } = require('../../lib/procedures');
const {
  resolveDoctorUUID,
  sendDoctorUuidResolveError,
} = require('../../lib/resolveDoctorUUID');

console.log("DOCTOR TREATMENTS ROUTES LOADED");

const VALID_LANGS = new Set(['en', 'tr', 'ru', 'ka']);

/** DB şeması: procedure_type (+ isteğe bağlı procedure_id); procedure_name kolonu yok. */
const ENCOUNTER_TREATMENTS_SELECT_CANDIDATES = [
  'id, encounter_id, tooth_number, procedure_type, procedure_id, status, assigned_doctor_id, chair, scheduled_at, created_at, updated_at, created_by_doctor_id',
  'id, encounter_id, tooth_number, procedure_type, procedure_id, status, assigned_doctor_id, chair, scheduled_at, created_at, created_by_doctor_id',
  'id, encounter_id, tooth_number, procedure_type, status, created_at, created_by_doctor_id',
  'id, encounter_id, tooth_number, procedure_type, status, created_at',
];

async function fetchEncounterTreatmentsRows(encounterId) {
  const eid = String(encounterId || '').trim();
  if (!eid) return { data: [], error: null };
  let lastErr = null;
  for (const sel of ENCOUNTER_TREATMENTS_SELECT_CANDIDATES) {
    const { data, error } = await supabase
      .from('encounter_treatments')
      .select(sel)
      .eq('encounter_id', eid)
      .order('created_at', { ascending: false });
    if (!error) {
      return { data: data || [], error: null };
    }
    lastErr = error;
    const code = String(error.code || '');
    if (!['42703', 'PGRST204', '42P01'].includes(code)) {
      return { data: [], error };
    }
  }
  return { data: [], error: lastErr };
}

/*
-------------------------------------------------------
GET treatments by encounter
-------------------------------------------------------
*/
router.get('/encounters/:id/treatments', authenticateToken, async (req, res) => {
  try {
    const encounterId = req.params.id;
    const start = Date.now();
    const lang = VALID_LANGS.has(String(req.query.lang || '').toLowerCase().slice(0, 2))
      ? String(req.query.lang).toLowerCase().slice(0, 2)
      : 'en';
    const clinicId = req.user?.clinicId || null;

    const { data, error } = await fetchEncounterTreatmentsRows(encounterId);

    const duration = Date.now() - start;
    console.log('DB query duration: /encounters/:id/treatments', duration, 'ms');

    if (error) {
      console.error('[GET TREATMENTS ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error', details: error.message });
    }

    const legacyIds = [
      ...new Set(
        (data || [])
          .filter((t) => !t.procedure_type && t.procedure_id)
          .map((t) => t.procedure_id)
          .filter(Boolean)
      ),
    ];
    const procMap = new Map();
    if (legacyIds.length > 0) {
      const { data: procs } = await supabase.from('procedures').select('id, name').in('id', legacyIds);
      (procs || []).forEach((p) => procMap.set(p.id, p.name));
    }

    const resolvedTypes = (data || []).map(
      (t) =>
        String(t.procedure_type || procMap.get(t.procedure_id) || t.procedure_id || 'UNKNOWN').trim() ||
        'UNKNOWN'
    );

    const usedTypes = [...new Set(resolvedTypes.filter(Boolean))];
    let priceMap = {};
    if (usedTypes.length > 0 && clinicId) {
      const { data: prices } = await supabase
        .from('treatment_prices')
        .select('type, price, currency')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .in('type', usedTypes);
      (prices || []).forEach((p) => {
        priceMap[p.type] = { price: p.price, currency: p.currency };
      });
    }

    const treatments = (data || []).map((t, i) => {
      const typeName = resolvedTypes[i];
      const label = getProcedureLabel(typeName, lang);
      return {
        ...t,
        tooth_fdi_code: t.tooth_number,
        procedure_type: typeName,
        procedure: { type: typeName, name: label || typeName },
        price: priceMap[typeName] || null,
      };
    });

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
    const body = req.body || {};
    const tokenDoctorRaw = req.user?.id || req.user?.doctorId;
    let createdByUuid;
    try {
      createdByUuid = await resolveDoctorUUID(tokenDoctorRaw);
    } catch (e) {
      if (sendDoctorUuidResolveError(res, e)) return;
      throw e;
    }

    const toothRaw = body.tooth_number ?? body.toothNumber;
    const n = Number(toothRaw);
    const procTypeRaw =
      body.procedure_type ||
      body.procedureType ||
      body.procedure_name ||
      body.procedureName ||
      (body.procedure && body.procedure.type);
    const procType = String(procTypeRaw || '')
      .trim()
      .toUpperCase();

    if (!Number.isFinite(n) || n < 11 || n > 48) {
      return res.status(400).json({ ok: false, error: 'invalid_tooth_number' });
    }
    if (!procType) {
      return res.status(400).json({
        ok: false,
        error: 'procedure_type_required',
        message: 'Send procedure_type (or legacy procedure_name)',
      });
    }

    const insert = {
      encounter_id: encounterId,
      tooth_number: n,
      procedure_type: procType,
      status: String(body.status || 'planned').toLowerCase(),
      created_by_doctor_id: createdByUuid,
    };
    if (body.procedure_id != null && String(body.procedure_id).trim()) {
      insert.procedure_id = String(body.procedure_id).trim();
    }
    if (body.chair != null && String(body.chair).trim()) insert.chair = String(body.chair).trim();
    if (body.scheduled_at != null && String(body.scheduled_at).trim()) {
      insert.scheduled_at = String(body.scheduled_at).trim();
    }
    const assignRaw =
      body.assigned_doctor_id != null && String(body.assigned_doctor_id).trim()
        ? String(body.assigned_doctor_id).trim()
        : null;
    if (assignRaw) {
      let assignUuid;
      try {
        assignUuid = await resolveDoctorUUID(assignRaw);
      } catch (e) {
        if (sendDoctorUuidResolveError(res, e)) return;
        throw e;
      }
      insert.assigned_doctor_id = assignUuid;
    }

    const { data, error } = await supabase.from('encounter_treatments').insert(insert).select().single();

    if (error) {
      console.error('[POST TREATMENT ERROR]', error);
      return res.status(500).json({ ok: false, error: 'db_error', details: error.message });
    }

    return res.json({ ok: true, treatment: data });
  } catch (err) {
    if (sendDoctorUuidResolveError(res, err)) return;
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