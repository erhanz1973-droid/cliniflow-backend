// server/models/EncounterDiagnosis.js
const { getSupabaseClient } = require('../../supabase');

class EncounterDiagnosis {
  static async create(data) {
    const { encounter_id, icd10_code, icd10_description, is_primary = false, created_by_doctor_id } = data;
    
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('encounter_diagnoses')
      .insert({
        encounter_id,
        icd10_code,
        icd10_description,
        is_primary,
        created_by_doctor_id
      })
      .select()
      .single();
    
    if (error) {
      console.error('[ENCOUNTER DIAGNOSIS] Create error:', error);
      throw error;
    }
    
    return result;
  }

  static async findByEncounterId(encounter_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('encounter_diagnoses')
      .select('*, doctors:name')
      .eq('encounter_id', encounter_id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    
    if (error) {
      console.error('[ENCOUNTER DIAGNOSIS] FindByEncounterId error:', error);
      throw error;
    }
    
    return result || [];
  }

  static async findPrimaryDiagnosis(encounter_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('encounter_diagnoses')
      .select('*')
      .eq('encounter_id', encounter_id)
      .eq('is_primary', true)
      .single();
    
    if (error) {
      console.error('[ENCOUNTER DIAGNOSIS] FindPrimaryDiagnosis error:', error);
      throw error;
    }
    
    return result;
  }

  static async updatePrimaryStatus(id, is_primary, doctor_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('encounter_diagnoses')
      .update({ is_primary })
      .eq('id', id)
      .eq('created_by_doctor_id', doctor_id)
      .select()
      .single();
    
    if (error) {
      console.error('[ENCOUNTER DIAGNOSIS] UpdatePrimaryStatus error:', error);
      throw error;
    }
    
    return result;
  }

  static async delete(id, doctor_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('encounter_diagnoses')
      .delete()
      .eq('id', id)
      .eq('created_by_doctor_id', doctor_id)
      .select()
      .single();
    
    if (error) {
      console.error('[ENCOUNTER DIAGNOSIS] Delete error:', error);
      throw error;
    }
    
    return result;
  }
}

module.exports = EncounterDiagnosis;
