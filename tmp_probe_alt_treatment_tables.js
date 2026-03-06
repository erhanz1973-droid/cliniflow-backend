require('dotenv').config();
const { supabase } = require('./cliniflow-admin/lib/supabase');

const patientId = process.argv[2] || 'fb4ee307-69d3-4492-b040-24aeafe6b70b';

const tables = [
  'encounter_treatments',
  'encounter_procedures',
  'patient_treatments',
  'treatments',
  'procedure_items'
];

(async () => {
  const pe = await supabase
    .from('patient_encounters')
    .select('id')
    .eq('patient_id', patientId);

  const encounterIds = (pe.data || []).map((x) => x.id);

  const result = {
    patientId,
    encounterCount: encounterIds.length,
    probes: []
  };

  for (const table of tables) {
    const try1 = await supabase
      .from(table)
      .select('id, encounter_id, created_at')
      .in('encounter_id', encounterIds.length ? encounterIds : ['00000000-0000-0000-0000-000000000000'])
      .limit(3);

    if (!try1.error) {
      result.probes.push({
        table,
        mode: 'encounter_id',
        ok: true,
        count: Array.isArray(try1.data) ? try1.data.length : 0,
        sample: try1.data?.[0] || null,
      });
      continue;
    }

    const try2 = await supabase
      .from(table)
      .select('id, patient_id, created_at')
      .eq('patient_id', patientId)
      .limit(3);

    if (!try2.error) {
      result.probes.push({
        table,
        mode: 'patient_id',
        ok: true,
        count: Array.isArray(try2.data) ? try2.data.length : 0,
        sample: try2.data?.[0] || null,
      });
      continue;
    }

    result.probes.push({
      table,
      ok: false,
      error1: { code: try1.error.code, message: try1.error.message },
      error2: { code: try2.error.code, message: try2.error.message },
    });
  }

  console.log(JSON.stringify(result, null, 2));
})();
