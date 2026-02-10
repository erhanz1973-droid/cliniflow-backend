// server/models/TreatmentActivityLog.js
const { pool } = require('../config/database');

class TreatmentActivityLog {
  static async create(data) {
    const { entity_type, entity_id, action, performed_by_user_id, performed_by_user_type } = data;
    
    const query = `
      INSERT INTO treatment_activity_log (entity_type, entity_id, action, performed_by_user_id, performed_by_user_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      entity_type,
      entity_id,
      action,
      performed_by_user_id,
      performed_by_user_type
    ]);
    return result.rows[0];
  }

  static async findByEntity(entity_type, entity_id) {
    const query = `
      SELECT tal.*, 
             CASE 
               WHEN performed_by_user_type = 'doctor' THEN (SELECT name FROM doctors WHERE id = performed_by_user_id)
               WHEN performed_by_user_type = 'admin' THEN (SELECT name FROM admins WHERE id = performed_by_user_id)
               WHEN performed_by_user_type = 'patient' THEN (SELECT name FROM patients WHERE id = performed_by_user_id)
             END as performer_name
      FROM treatment_activity_log tal
      WHERE tal.entity_type = $1 AND tal.entity_id = $2
      ORDER BY tal.created_at DESC
    `;
    
    const result = await pool.query(query, [entity_type, entity_id]);
    return result.rows;
  }

  static async findByEncounter(encounter_id) {
    const query = `
      SELECT tal.*, 
             CASE 
               WHEN performed_by_user_type = 'doctor' THEN (SELECT name FROM doctors WHERE id = performed_by_user_id)
               WHEN performed_by_user_type = 'admin' THEN (SELECT name FROM admins WHERE id = performed_by_user_id)
               WHEN performed_by_user_type = 'patient' THEN (SELECT name FROM patients WHERE id = performed_by_user_id)
             END as performer_name
      FROM treatment_activity_log tal
      WHERE (tal.entity_type = 'encounter' AND tal.entity_id = $1)
         OR (tal.entity_type = 'diagnosis' AND tal.entity_id IN (SELECT id FROM encounter_diagnoses WHERE encounter_id = $1))
         OR (tal.entity_type = 'treatment_plan' AND tal.entity_id IN (SELECT id FROM treatment_plans WHERE encounter_id = $1))
         OR (tal.entity_type = 'treatment_item' AND tal.entity_id IN (SELECT ti.id FROM treatment_items ti JOIN treatment_plans tp ON ti.treatment_plan_id = tp.id WHERE tp.encounter_id = $1))
      ORDER BY tal.created_at DESC
    `;
    
    const result = await pool.query(query, [encounter_id]);
    return result.rows;
  }
}

module.exports = TreatmentActivityLog;
