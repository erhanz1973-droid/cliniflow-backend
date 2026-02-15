// server/models/TreatmentPlan.js
const { getSupabaseClient } = require('../../supabase');

class TreatmentPlan {
  static async create(data) {
    const { encounter_id, created_by_doctor_id, treatment_group_id = null, assigned_doctor_id = null } = data;
    
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('treatment_plans')
      .insert({
        encounter_id,
        created_by_doctor_id,
        treatment_group_id,
        assigned_doctor_id,
        status: 'draft'
      })
      .select()
      .single();
    
    if (error) {
      console.error('[TREATMENT PLAN] Create error:', error);
      throw error;
    }
    
    return result;
  }

  static async findById(id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('treatment_plans')
      .select(`
        *,
        patient_encounters!inner(patient_id),
        doctors!inner(name),
        treatment_groups!inner(group_name),
        assigned_doctors!inner(name)
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('[TREATMENT PLAN] FindById error:', error);
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
      .from('treatment_plans')
      .select(`
        *,
        patient_encounters!inner(patient_id),
        doctors!inner(name),
        treatment_groups!inner(group_name),
        assigned_doctors!inner(name)
      `)
      .eq('encounter_id', encounter_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[TREATMENT PLAN] FindByEncounterId error:', error);
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
      .from('treatment_plans')
      .select(`
        *,
        patient_encounters!inner(patient_id),
        doctors!inner(name),
        treatment_groups!inner(group_name)
      `)
      .eq('treatment_group_id', treatment_group_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[TREATMENT PLAN] FindByTreatmentGroup error:', error);
      throw error;
    }
    
    return result || [];
  }

  static async findByAssignedDoctor(doctor_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('treatment_plans')
      .select(`
        *,
        patient_encounters!inner(patient_id),
        doctors!inner(name),
        treatment_groups!inner(group_name)
      `)
      .eq('assigned_doctor_id', doctor_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[TREATMENT PLAN] FindByAssignedDoctor error:', error);
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
      .from('treatment_plans')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('[TREATMENT PLAN] UpdateStatus error:', error);
      throw error;
    }
    
    return result;
  }

  static async assignDoctor(id, assigned_doctor_id) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client not available');
    }
    
    const { data: result, error } = await supabase
      .from('treatment_plans')
      .update({ assigned_doctor_id })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('[TREATMENT PLAN] AssignDoctor error:', error);
      throw error;
    }
    
    return result;
  }

  static async canCreateTreatmentPlan(encounter_id) {
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
      console.error('[TREATMENT PLAN] CanCreateTreatmentPlan error:', error);
      throw error;
    }
    
    return result !== null;
  }
}

module.exports = TreatmentPlan;
