// server/models/PatientEncounter.js
const { pool } = require('../config/database');

class PatientEncounter {
  static async create(data) {
    const { patient_id, created_by_doctor_id, encounter_type = 'initial', treatment_group_id = null } = data;
    
    const query = `
      INSERT INTO patient_encounters (patient_id, created_by_doctor_id, encounter_type, status, treatment_group_id)
      VALUES ($1, $2, $3, 'draft', $4)
      RETURNING *
    `;
    
    const result = await pool.query(query, [patient_id, created_by_doctor_id, encounter_type, treatment_group_id]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT pe.*, p.name as patient_name, d.name as doctor_name,
             tg.group_name as treatment_group_name
      FROM patient_encounters pe
      JOIN patients p ON pe.patient_id = p.id
      JOIN doctors d ON pe.created_by_doctor_id = d.id
      LEFT JOIN treatment_groups tg ON pe.treatment_group_id = tg.id
      WHERE pe.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findByPatientId(patient_id) {
    const query = `
      SELECT pe.*, d.name as doctor_name,
             tg.group_name as treatment_group_name
      FROM patient_encounters pe
      JOIN doctors d ON pe.created_by_doctor_id = d.id
      LEFT JOIN treatment_groups tg ON pe.treatment_group_id = tg.id
      WHERE pe.patient_id = $1
      ORDER BY pe.created_at DESC
    `;
    
    const result = await pool.query(query, [patient_id]);
    return result.rows;
  }

  static async findByTreatmentGroup(treatment_group_id) {
    const query = `
      SELECT pe.*, p.name as patient_name, d.name as doctor_name
      FROM patient_encounters pe
      JOIN patients p ON pe.patient_id = p.id
      JOIN doctors d ON pe.created_by_doctor_id = d.id
      WHERE pe.treatment_group_id = $1
      ORDER BY pe.created_at DESC
    `;
    
    const result = await pool.query(query, [treatment_group_id]);
    return result.rows;
  }

  static async updateStatus(id, status) {
    const query = `
      UPDATE patient_encounters 
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, status]);
    return result.rows[0];
  }

  static async hasPrimaryDiagnosis(encounter_id) {
    const query = `
      SELECT COUNT(*) as count
      FROM encounter_diagnoses
      WHERE encounter_id = $1 AND is_primary = true
    `;
    
    const result = await pool.query(query, [encounter_id]);
    return parseInt(result.rows[0].count) > 0;
  }
}

module.exports = PatientEncounter;
