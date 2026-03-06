require('dotenv').config();
const { supabase } = require('./cliniflow-admin/lib/supabase');

(async () => {
  const patientId = 'fb4ee307-69d3-4492-b040-24aeafe6b70b';
  const pe = await supabase.from('patient_encounters').select('id').eq('patient_id', patientId);
  const encounterIds = (pe.data || []).map((x) => x.id);
  const plans = await supabase.from('treatment_plans').select('id,encounter_id').in('encounter_id', encounterIds);
  const planIds = (plans.data || []).map((x) => x.id);

  const candidates = [
    'id, treatment_plan_id, tooth_fdi_code, procedure_code, status, created_at',
    'id, treatment_plan_id, tooth_fdi_code, status, created_at',
    'id, treatment_plan_id, status, created_at',
  ];

  const out = {
    patientId,
    encounterCount: encounterIds.length,
    planIdsCount: planIds.length,
    attempts: [],
  };

  for (const selectClause of candidates) {
    const r = planIds.length
      ? await supabase.from('treatment_items').select(selectClause).in('treatment_plan_id', planIds)
      : { data: [], error: null };

    out.attempts.push({
      select: selectClause,
      ok: !r.error,
      count: Array.isArray(r.data) ? r.data.length : 0,
      error: r.error ? { code: r.error.code, message: r.error.message } : null,
      sample: r.data?.[0] || null,
    });

    if (!r.error) break;
  }

  console.log(JSON.stringify(out, null, 2));
})();
