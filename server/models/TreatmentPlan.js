// server/models/TreatmentPlan.js
const { pool } = require('../config/database');

class TreatmentPlan {
  static async create(data) {
    const { encounter_id, created_by_doctor_id, treatment_group_id = null, assigned_doctor_id = null } = data;
    
    const query = `
      INSERT INTO treatment_plans (encounter_id, created_by_doctor_id, treatment_group_id, assigned_doctor_id, status)
      VALUES ($1, $2, $3, $4, 'draft')
      RETURNING *
    `;
    
    const result = await pool.query(query, [encounter_id, created_by_doctor_id, treatment_group_id, assigned_doctor_id]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT tp.*, pe.patient_id, d.name as doctor_name,
             tg.group_name as treatment_group_name,
             ad.name as assigned_doctor_name
      FROM treatment_plans tp
      JOIN patient_encounters pe ON tp.encounter_id = pe.id
      JOIN doctors d ON tp.created_by_doctor_id = d.id
      LEFT JOIN treatment_groups tg ON tp.treatment_group_id = tg.id
      LEFT JOIN doctors ad ON tp.assigned_doctor_id = ad.id
      WHERE tp.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByEncounterId(encounter_id) {
    const query = `
      SELECT tp.*, d.name as doctor_name,
             tg.group_name as treatment_group_name,
             ad.name as assigned_doctor_name
      FROM treatment_plans tp
      JOIN doctors d ON tp.created_by_doctor_id = d.id
      LEFT JOIN treatment_groups tg ON tp.treatment_group_id = tg.id
      LEFT JOIN doctors ad ON tp.assigned_doctor_id = ad.id
      WHERE tp.encounter_id = $1
      ORDER BY tp.created_at DESC
    `;
    
    const result = await pool.query(query, [encounter_id]);
    return result.rows;
  }

  static async findByTreatmentGroup(treatment_group_id) {
    const query = `
      SELECT tp.*, pe.patient_id, d.name as doctor_name,
             ad.name as assigned_doctor_name
      FROM treatment_plans tp
      JOIN patient_encounters pe ON tp.encounter_id = pe.id
      JOIN doctors d ON tp.created_by_doctor_id = d.id
      LEFT JOIN doctors ad ON tp.assigned_doctor_id = ad.id
      WHERE tp.treatment_group_id = $1
      ORDER BY tp.created_at DESC
    `;
    
    const result = await pool.query(query, [treatment_group_id]);
    return result.rows;
  }

  static async findByAssignedDoctor(doctor_id) {
    const query = `
      SELECT tp.*, pe.patient_id, d.name as doctor_name,
             tg.group_name as treatment_group_name
      FROM treatment_plans tp
      JOIN patient_encounters pe ON tp.encounter_id = pe.id
      JOIN doctors d ON tp.created_by_doctor_id = d.id
      LEFT JOIN treatment_groups tg ON tp.treatment_group_id = tg.id
      WHERE tp.assigned_doctor_id = $1
      ORDER BY tp.created_at DESC
    `;
    
    const result = await pool.query(query, [doctor_id]);
    return result.rows;
  }

  static async updateStatus(id, status, admin_id = null) {
    const query = `
      UPDATE treatment_plans 
      SET status = $2, 
          approved_by_admin_id = $3,
          approved_at = CASE WHEN $2 = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, status, admin_id]);
    return result.rows[0];
  }

  static async assignDoctor(id, assigned_doctor_id) {
    const query = `
      UPDATE treatment_plans 
      SET assigned_doctor_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, assigned_doctor_id]);
    return result.rows[0];
  }

  static async getActivePlan(encounter_id) {
    const query = `
      SELECT *
      FROM treatment_plans
      WHERE encounter_id = $1 AND status IN ('draft', 'proposed', 'approved')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [encounter_id]);
    return result.rows[0];
  }

  static async canCreateTreatmentPlan(encounter_id) {
    // Check if encounter has primary diagnosis
    const diagnosisQuery = `
      SELECT COUNT(*) as count
      FROM encounter_diagnoses
      WHERE encounter_id = $1 AND is_primary = true
    `;
    
    const diagnosisResult = await pool.query(diagnosisQuery, [encounter_id]);
    const hasPrimaryDiagnosis = parseInt(diagnosisResult.rows[0].count) > 0;
    
    if (!hasPrimaryDiagnosis) {
      return { canCreate: false, reason: 'primary_diagnosis_required' };
    }
    
    // Check if there's already an active plan
    const activePlan = await this.getActivePlan(encounter_id);
    if (activePlan && activePlan.status !== 'completed' && activePlan.status !== 'rejected') {
      return { canCreate: false, reason: 'active_plan_exists' };
    }
    
    return { canCreate: true };
  }
}

module.exports = TreatmentPlan;
