require('dotenv').config();
const { supabase } = require('./cliniflow-admin/lib/supabase');

const patientId = process.argv[2] || 'fb4ee307-69d3-4492-b040-24aeafe6b70b';

async function run() {
  const summary = {
    patientId,
    patientEncounters: 0,
    encounters: 0,
    treatmentPlans: 0,
    treatmentPlanItems: 0,
    errors: {},
    sample: {},
  };

  const peRes = await supabase
    .from('patient_encounters')
    .select('id, patient_id, status, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (peRes.error) {
    summary.errors.patient_encounters = {
      code: peRes.error.code,
      message: peRes.error.message,
    };
  }

  const eRes = await supabase
    .from('encounters')
    .select('id, patient_id, status, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (eRes.error) {
    summary.errors.encounters = {
      code: eRes.error.code,
      message: eRes.error.message,
    };
  }

  const patientEncounterIds = Array.isArray(peRes.data) ? peRes.data.map((r) => r.id) : [];
  const encounterIds = Array.isArray(eRes.data) ? eRes.data.map((r) => r.id) : [];
  const allEncounterIds = [...new Set([...patientEncounterIds, ...encounterIds])];

  summary.patientEncounters = patientEncounterIds.length;
  summary.encounters = encounterIds.length;
  summary.sample.patientEncounter = peRes.data?.[0] || null;
  summary.sample.encounter = eRes.data?.[0] || null;

  if (allEncounterIds.length > 0) {
    const plansRes = await supabase
      .from('treatment_plans')
      .select('id, encounter_id, status, created_at')
      .in('encounter_id', allEncounterIds)
      .order('created_at', { ascending: false });

    if (plansRes.error) {
      summary.errors.treatment_plans = {
        code: plansRes.error.code,
        message: plansRes.error.message,
      };
    }

    const planIds = Array.isArray(plansRes.data) ? plansRes.data.map((p) => p.id) : [];
    summary.treatmentPlans = planIds.length;
    summary.sample.treatmentPlan = plansRes.data?.[0] || null;

    if (planIds.length > 0) {
      const itemsRes = await supabase
        .from('treatment_plan_items')
        .select('id, treatment_plan_id, tooth_fdi_code, tooth_number, procedure_code, procedure_name, status, created_at')
        .in('treatment_plan_id', planIds)
        .order('created_at', { ascending: false });

      if (itemsRes.error) {
        summary.errors.treatment_plan_items = {
          code: itemsRes.error.code,
          message: itemsRes.error.message,
        };
      }

      summary.treatmentPlanItems = Array.isArray(itemsRes.data) ? itemsRes.data.length : 0;
      summary.sample.treatmentPlanItem = itemsRes.data?.[0] || null;
    }
  }

  const diagRes = await supabase
    .from('encounter_diagnoses')
    .select('id, encounter_id, icd10_code, tooth_number, created_at')
    .in('encounter_id', allEncounterIds.length ? allEncounterIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false });

  if (diagRes.error) {
    summary.errors.encounter_diagnoses = {
      code: diagRes.error.code,
      message: diagRes.error.message,
    };
  }

  summary.encounterDiagnoses = Array.isArray(diagRes.data) ? diagRes.data.length : 0;
  summary.sample.encounterDiagnosis = diagRes.data?.[0] || null;

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((err) => {
  console.error(JSON.stringify({ fatal: err?.message || String(err) }, null, 2));
  process.exit(1);
});
