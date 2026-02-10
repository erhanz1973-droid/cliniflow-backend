// server/models/EncounterDiagnosis.js
const { pool } = require('../config/database');

class EncounterDiagnosis {
  static async create(data) {
    const { encounter_id, icd10_code, icd10_description, is_primary = false, created_by_doctor_id } = data;
    
    const query = `
      INSERT INTO encounter_diagnoses (encounter_id, icd10_code, icd10_description, is_primary, created_by_doctor_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      encounter_id, 
      icd10_code, 
      icd10_description, 
      is_primary, 
      created_by_doctor_id
    ]);
    return result.rows[0];
  }

  static async findByEncounterId(encounter_id) {
    const query = `
      SELECT ed.*, d.name as doctor_name
      FROM encounter_diagnoses ed
      JOIN doctors d ON ed.created_by_doctor_id = d.id
      WHERE ed.encounter_id = $1
      ORDER BY ed.is_primary DESC, ed.created_at ASC
    `;
    
    const result = await pool.query(query, [encounter_id]);
    return result.rows;
  }

  static async findPrimaryDiagnosis(encounter_id) {
    const query = `
      SELECT *
      FROM encounter_diagnoses
      WHERE encounter_id = $1 AND is_primary = true
      LIMIT 1
    `;
    
    const result = await pool.query(query, [encounter_id]);
    return result.rows[0];
  }

  static async updatePrimaryStatus(id, is_primary, doctor_id) {
    const query = `
      UPDATE encounter_diagnoses 
      SET is_primary = $2
      WHERE id = $1 AND created_by_doctor_id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, is_primary, doctor_id]);
    return result.rows[0];
  }

  static async delete(id, doctor_id) {
    const query = `
      DELETE FROM encounter_diagnoses
      WHERE id = $1 AND created_by_doctor_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, doctor_id]);
    return result.rows[0];
  }
}

module.exports = EncounterDiagnosis;
