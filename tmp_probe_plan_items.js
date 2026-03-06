require('dotenv').config();
const { supabase } = require('./cliniflow-admin/lib/supabase');

const patientId = process.argv[2] || 'fb4ee307-69d3-4492-b040-24aeafe6b70b';

(async () => {
  const pe = await supabase
    .from('patient_encounters')
    .select('id, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (pe.error) {
    console.log(JSON.stringify({ stage: 'patient_encounters', error: pe.error }, null, 2));
    process.exit(0);
  }

  const encounterIds = (pe.data || []).map((x) => x.id);
  const plans = encounterIds.length
    ? await supabase.from('treatment_plans').select('id, encounter_id, created_at').in('encounter_id', encounterIds)
    : { data: [], error: null };

  if (plans.error) {
    console.log(JSON.stringify({ stage: 'treatment_plans', error: plans.error }, null, 2));
    process.exit(0);
  }

  const planIds = (plans.data || []).map((p) => p.id);

  const candidates = [
    'id, treatment_plan_id, tooth_fdi_code, tooth_number, procedure_code, procedure_name, procedure_description, status, category, type, created_at, updated_at',
    'id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, created_at, updated_at',
    'id, treatment_plan_id, tooth_fdi_code, procedure_code, procedure_name, status, created_at',
    'id, treatment_plan_id, tooth_number, procedure_code, procedure_name, procedure_description, status, category, type, created_at, updated_at',
    'id, treatment_plan_id, tooth_number, procedure_name, status, created_at, updated_at',
    'id, treatment_plan_id, tooth_number, procedure_name, status, created_at',
    'id, treatment_plan_id, status, created_at, updated_at',
    'id, treatment_plan_id, status, created_at',
  ];

  const attempts = [];
  let success = null;

  for (const selectClause of candidates) {
    const result = planIds.length
      ? await supabase
          .from('treatment_plan_items')
          .select(selectClause)
          .in('treatment_plan_id', planIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };

    attempts.push({
      select: selectClause,
      ok: !result.error,
      count: Array.isArray(result.data) ? result.data.length : 0,
      error: result.error ? { code: result.error.code, message: result.error.message } : null,
    });

    if (!result.error) {
      success = {
        select: selectClause,
        count: (result.data || []).length,
        sample: result.data?.[0] || null,
      };
      break;
    }
  }

  console.log(JSON.stringify({
    patientId,
    encounterCount: encounterIds.length,
    planCount: planIds.length,
    success,
    attempts,
  }, null, 2));
})();
