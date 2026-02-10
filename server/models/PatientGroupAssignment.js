// server/models/PatientGroupAssignment.js
const { pool } = require('../config/database');

class PatientGroupAssignment {
  static async assignPatient(data) {
    const { treatment_group_id, patient_id, assigned_by_admin_id } = data;
    
    const query = `
      INSERT INTO patient_group_assignments (treatment_group_id, patient_id, assigned_by_admin_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (treatment_group_id, patient_id) WHERE unassigned_at IS NULL
      DO UPDATE SET unassigned_at = NULL, assigned_by_admin_id = EXCLUDED.assigned_by_admin_id
      RETURNING *
    `;
    
    const result = await pool.query(query, [treatment_group_id, patient_id, assigned_by_admin_id]);
    return result.rows[0];
  }

  static async unassignPatient(treatment_group_id, patient_id) {
    const query = `
      UPDATE patient_group_assignments 
      SET unassigned_at = CURRENT_TIMESTAMP
      WHERE treatment_group_id = $1 AND patient_id = $2 AND unassigned_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [treatment_group_id, patient_id]);
    return result.rows[0];
  }

  static async getGroupPatients(treatment_group_id) {
    const query = `
      SELECT pga.*, p.name as patient_name, p.phone as patient_phone, p.referral_code
      FROM patient_group_assignments pga
      JOIN patients p ON pga.patient_id = p.id
      WHERE pga.treatment_group_id = $1 AND pga.unassigned_at IS NULL
      ORDER BY pga.assigned_at ASC
    `;
    
    const result = await pool.query(query, [treatment_group_id]);
    return result.rows;
  }

  static async getPatientGroups(patient_id) {
    const query = `
      SELECT tg.*, pga.assigned_at
      FROM treatment_groups tg
      JOIN patient_group_assignments pga ON tg.id = pga.treatment_group_id
      WHERE pga.patient_id = $1 AND pga.unassigned_at IS NULL AND tg.status = 'active'
      ORDER BY tg.group_name ASC
    `;
    
    const result = await pool.query(query, [patient_id]);
    return result.rows;
  }

  static async getPatientPrimaryGroup(patient_id) {
    const query = `
      SELECT tg.*, pga.assigned_at
      FROM treatment_groups tg
      JOIN patient_group_assignments pga ON tg.id = pga.treatment_group_id
      WHERE pga.patient_id = $1 AND pga.unassigned_at IS NULL AND tg.status = 'active'
      ORDER BY pga.assigned_at ASC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [patient_id]);
    return result.rows[0];
  }
}

module.exports = PatientGroupAssignment;
