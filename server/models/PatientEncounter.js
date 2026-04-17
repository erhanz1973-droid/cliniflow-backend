// server/models/PatientEncounter.js
const { getSupabaseClient } = require('../../supabase');

class PatientEncounter {
  static async create(data) {
    const { patient_id, created_by_doctor_id, encounter_type = 'initial', treatment_group_id = null } = data;
    
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('patient_encounters')
      .insert({
        patient_id,
        created_by_doctor_id,
        encounter_type,
        status: 'draft',
        treatment_group_id
      })
      .select()
      .single();
    
    if (error) {
      console.error('[PATIENT ENCOUNTER] Create error:', error);
      throw error;
    }
    
    console.log('[PATIENT ENCOUNTER] Created:', result);
    return result;
  }

  static async findById(id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('patient_encounters')
      .select(`
        *,
        patients!inner(name),
        doctors!inner(name),
        treatment_groups!inner(group_name)
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('[PATIENT ENCOUNTER] FindById error:', error);
      throw error;
    }
    
    return result;
  }

  static async findByPatientId(patientId) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('patient_encounters')
      .select(`
        *,
        patients!inner(name),
        doctors!inner(name),
        treatment_groups!inner(group_name)
      `)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[PATIENT ENCOUNTER] FindByPatientId error:', error);
      throw error;
    }
    
    return result || [];
  }

  static async findByTreatmentGroup(treatment_group_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('patient_encounters')
      .select(`
        *,
        patients!inner(name),
        doctors!inner(name)
      `)
      .eq('treatment_group_id', treatment_group_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[PATIENT ENCOUNTER] FindByTreatmentGroup error:', error);
      throw error;
    }
    
    return result || [];
  }

  static async updateStatus(id, status) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('patient_encounters')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('[PATIENT ENCOUNTER] UpdateStatus error:', error);
      throw error;
    }
    
    return result;
  }

  static async hasPrimaryDiagnosis(encounter_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('encounter_diagnoses')
      .select('id')
      .eq('encounter_id', encounter_id)
      .eq('is_primary', true)
      .single();
    
    if (error) {
      console.error('[PATIENT ENCOUNTER] HasPrimaryDiagnosis error:', error);
      throw error;
    }
    
    return result !== null;
  }
}

module.exports = PatientEncounter;
