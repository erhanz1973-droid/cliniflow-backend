// server/models/TreatmentGroup.js
const { pool } = require('../config/database');

class TreatmentGroup {
  static async create(data) {
    const { group_name, description, created_by_admin_id } = data;
    
    const query = `
      INSERT INTO treatment_groups (group_name, description, created_by_admin_id)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const result = await pool.query(query, [group_name, description, created_by_admin_id]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT tg.*
      FROM treatment_groups tg
      WHERE tg.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findAll(status = 'active') {
    const query = `
      SELECT tg.*,
             COUNT(DISTINCT tgm.doctor_id) as member_count,
             COUNT(DISTINCT pga.patient_id) as patient_count
      FROM treatment_groups tg
      LEFT JOIN treatment_group_members tgm ON tg.id = tgm.treatment_group_id AND tgm.left_at IS NULL
      LEFT JOIN patient_group_assignments pga ON tg.id = pga.treatment_group_id AND pga.unassigned_at IS NULL
      WHERE tg.status = $1
      GROUP BY tg.id, tg.group_name, tg.description, tg.status, tg.created_at, tg.updated_at
      ORDER BY tg.created_at DESC
    `;
    
    const result = await pool.query(query, [status]);
    return result.rows;
  }

  static async updateStatus(id, status) {
    const query = `
      UPDATE treatment_groups 
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, status]);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `
      DELETE FROM treatment_groups WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}

module.exports = TreatmentGroup;
