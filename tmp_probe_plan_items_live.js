require('dotenv').config();
const { supabase } = require('./cliniflow-admin/lib/supabase');

const planId = process.argv[2] || '341e8e4d-58f8-4275-9d48-4069b6ce8140';

async function fetchFromTable(tableName) {
  const selectCandidates = [
    'id,treatment_plan_id,tooth_fdi_code,tooth_number,procedure_code,procedure_name,procedure_description,status,created_at,updated_at,scheduled_at,scheduled_date',
    'id,treatment_plan_id,tooth_fdi_code,tooth_number,procedure_code,procedure_name,status,created_at,updated_at',
    'id,treatment_plan_id,procedure_code,status,created_at',
  ];

  for (const selectClause of selectCandidates) {
    const result = await supabase
      .from(tableName)
      .select(selectClause)
      .eq('treatment_plan_id', planId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!result.error) {
      return {
        table: tableName,
        ok: true,
        count: Array.isArray(result.data) ? result.data.length : 0,
        latest: Array.isArray(result.data) && result.data.length > 0 ? result.data[0] : null,
      };
    }

    const code = String(result.error?.code || '');
    if (!['42703', 'PGRST204', 'PGRST205'].includes(code)) {
      return {
        table: tableName,
        ok: false,
        error: { code: result.error?.code, message: result.error?.message },
      };
    }
  }

  return {
    table: tableName,
    ok: false,
    error: { code: 'SELECT_FAILED', message: 'all select candidates failed' },
  };
}

(async () => {
  const [items, planItems] = await Promise.all([
    fetchFromTable('treatment_items'),
    fetchFromTable('treatment_plan_items'),
  ]);

  const plan = await supabase
    .from('treatment_plans')
    .select('id,encounter_id,patient_id,created_by_doctor_id,status,created_at')
    .eq('id', planId)
    .maybeSingle();

  console.log(JSON.stringify({
    planId,
    plan: plan.error ? { error: { code: plan.error.code, message: plan.error.message } } : plan.data,
    probeAt: new Date().toISOString(),
    tables: [items, planItems],
  }, null, 2));
})();
