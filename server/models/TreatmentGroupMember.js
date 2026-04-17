// server/models/TreatmentGroupMember.js
const { pool } = require('../config/database');

class TreatmentGroupMember {
  static async addMember(data) {
    const { treatment_group_id, doctor_id, role = 'member' } = data;
    
    const query = `
      INSERT INTO treatment_group_members (treatment_group_id, doctor_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (treatment_group_id, doctor_id) WHERE left_at IS NULL
      DO UPDATE SET role = EXCLUDED.role, left_at = NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [treatment_group_id, doctor_id, role]);
    return result.rows[0];
  }

  static async removeMember(treatment_group_id, doctor_id) {
    const query = `
      UPDATE treatment_group_members 
      SET left_at = CURRENT_TIMESTAMP
      WHERE treatment_group_id = $1 AND doctor_id = $2 AND left_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [treatment_group_id, doctor_id]);
    return result.rows[0];
  }

  static async getGroupMembers(treatment_group_id) {
    const query = `
      SELECT tgm.*, d.name as doctor_name, d.email as doctor_email
      FROM treatment_group_members tgm
      JOIN doctors d ON tgm.doctor_id = d.id
      WHERE tgm.treatment_group_id = $1 AND tgm.left_at IS NULL
      ORDER BY tgm.role DESC, tgm.joined_at ASC
    `;
    
    const result = await pool.query(query, [treatment_group_id]);
    return result.rows;
  }

  static async getDoctorGroups(doctor_id) {
    const query = `
      SELECT tg.*, tgm.role, tgm.joined_at
      FROM treatment_groups tg
      JOIN treatment_group_members tgm ON tg.id = tgm.treatment_group_id
      WHERE tgm.doctor_id = $1 AND tgm.left_at IS NULL AND tg.status = 'active'
      ORDER BY tg.group_name ASC
    `;
    
    const result = await pool.query(query, [doctor_id]);
    return result.rows;
  }

  static async updateMemberRole(treatment_group_id, doctor_id, role) {
    const query = `
      UPDATE treatment_group_members 
      SET role = $3
      WHERE treatment_group_id = $1 AND doctor_id = $2 AND left_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [treatment_group_id, doctor_id, role]);
    return result.rows[0];
  }
}

module.exports = TreatmentGroupMember;
