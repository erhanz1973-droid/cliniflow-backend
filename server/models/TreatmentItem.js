// server/models/TreatmentItem.js
const { pool } = require('../config/database');

class TreatmentItem {
  static async create(data) {
    const { 
      treatment_plan_id, 
      tooth_fdi_code, 
      procedure_code, 
      procedure_name, 
      linked_icd10_code = null,
      created_by_doctor_id 
    } = data;
    
    const query = `
      INSERT INTO treatment_items (
        treatment_plan_id, tooth_fdi_code, procedure_code, 
        procedure_name, linked_icd10_code, created_by_doctor_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      treatment_plan_id,
      tooth_fdi_code,
      procedure_code,
      procedure_name,
      linked_icd10_code,
      created_by_doctor_id
    ]);
    return result.rows[0];
  }

  static async findByTreatmentPlanId(treatment_plan_id) {
    const query = `
      SELECT ti.*, d.name as doctor_name
      FROM treatment_items ti
      JOIN doctors d ON ti.created_by_doctor_id = d.id
      WHERE ti.treatment_plan_id = $1
      ORDER BY ti.tooth_fdi_code ASC, ti.created_at ASC
    `;
    
    const result = await pool.query(query, [treatment_plan_id]);
    return result.rows;
  }

  static async findById(id) {
    const query = `
      SELECT ti.*, tp.encounter_id
      FROM treatment_items ti
      JOIN treatment_plans tp ON ti.treatment_plan_id = tp.id
      WHERE ti.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async updateStatus(id, status, doctor_id) {
    const query = `
      UPDATE treatment_items 
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND created_by_doctor_id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, status, doctor_id]);
    return result.rows[0];
  }

  static async delete(id, doctor_id) {
    const query = `
      DELETE FROM treatment_items
      WHERE id = $1 AND created_by_doctor_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, doctor_id]);
    return result.rows[0];
  }

  static async getToothMap(treatment_plan_id) {
    const query = `
      SELECT 
        tooth_fdi_code,
        COUNT(*) as item_count,
        STRING_AGG(DISTINCT status, ', ') as statuses
      FROM treatment_items
      WHERE treatment_plan_id = $1
      GROUP BY tooth_fdi_code
      ORDER BY tooth_fdi_code
    `;
    
    const result = await pool.query(query, [treatment_plan_id]);
    return result.rows;
  }
}

module.exports = TreatmentItem;
