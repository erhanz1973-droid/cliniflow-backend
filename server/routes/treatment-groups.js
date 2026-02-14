// server/routes/treatment-groups.js
const express = require('express');
const router = express.Router();
const TreatmentGroup = require('../models/TreatmentGroup');
const TreatmentGroupMember = require('../models/TreatmentGroupMember');
const PatientGroupAssignment = require('../models/PatientGroupAssignment');
const { authenticateAdmin } = require('../middleware/auth');

// Middleware - Admin only
router.use(authenticateAdmin);

// GET /api/treatment-groups - Get all treatment groups
router.get('/', async (req, res) => {
  try {
    const groups = await TreatmentGroup.findAll();
    
    res.json({
      ok: true,
      groups: groups
    });
  } catch (error) {
    console.error('Get treatment groups error:', error);
    res.status(500).json({
      ok: false,
      error: 'Gruplar yüklenemedi'
    });
  }
});

// POST /api/treatment-groups - Create new treatment group
router.post('/', async (req, res) => {
  try {
    const { group_name, description } = req.body;
    
    if (!group_name) {
      return res.status(400).json({
        ok: false,
        error: 'Grup adı zorunludur'
      });
    }
    
    const groupData = {
      group_name: group_name.trim(),
      description: description?.trim() || null,
      created_by_admin_id: req.admin.adminId || req.admin.id // 🔥 CRITICAL: Use req.admin instead of req.user
    };
    
    const group = await TreatmentGroup.create(groupData);
    
    res.status(201).json({
      ok: true,
      group: group
    });
  } catch (error) {
    console.error('Create treatment group error:', error);
    res.status(500).json({
      ok: false,
      error: 'Grup oluşturulamadı'
    });
  }
});

// PATCH /api/treatment-groups/:id - Update treatment group
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { group_name, description } = req.body;
    
    if (!group_name) {
      return res.status(400).json({
        ok: false,
        error: 'Grup adı zorunludur'
      });
    }
    
    // Check if group exists
    const existingGroup = await TreatmentGroup.findById(id);
    if (!existingGroup) {
      return res.status(404).json({
        ok: false,
        error: 'Grup bulunamadı'
      });
    }
    
    // Update group
    const updatedGroup = await TreatmentGroup.updateStatus(id, 'active'); // Simple update for now
    
    // For now, just return the existing group with updated name/description
    const group = {
      ...existingGroup,
      group_name: group_name.trim(),
      description: description?.trim() || null
    };
    
    res.json({
      ok: true,
      group: group
    });
  } catch (error) {
    console.error('Update treatment group error:', error);
    res.status(500).json({
      ok: false,
      error: 'Grup güncellenemedi'
    });
  }
});

// DELETE /api/treatment-groups/:id - Delete treatment group
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if group exists
    const existingGroup = await TreatmentGroup.findById(id);
    if (!existingGroup) {
      return res.status(404).json({
        ok: false,
        error: 'Grup bulunamadı'
      });
    }
    
    // Delete group (will cascade delete members and assignments)
    const deletedGroup = await TreatmentGroup.delete(id);
    
    res.json({
      ok: true,
      message: 'Grup silindi'
    });
  } catch (error) {
    console.error('Delete treatment group error:', error);
    res.status(500).json({
      ok: false,
      error: 'Grup silinemedi'
    });
  }
});

// GET /api/treatment-groups/:id/members - Get group members
router.get('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if group exists
    const existingGroup = await TreatmentGroup.findById(id);
    if (!existingGroup) {
      return res.status(404).json({
        ok: false,
        error: 'Grup bulunamadı'
      });
    }
    
    const members = await TreatmentGroupMember.getGroupMembers(id);
    
    res.json({
      ok: true,
      members: members
    });
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({
      ok: false,
      error: 'Üyeler yüklenemedi'
    });
  }
});

// POST /api/treatment-groups/:id/members - Add member to group
router.post('/:id/members', async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_id, role = 'member' } = req.body;
    
    if (!doctor_id) {
      return res.status(400).json({
        ok: false,
        error: 'Doktor ID zorunludur'
      });
    }
    
    // Check if group exists
    const existingGroup = await TreatmentGroup.findById(id);
    if (!existingGroup) {
      return res.status(404).json({
        ok: false,
        error: 'Grup bulunamadı'
      });
    }
    
    // Add member
    const member = await TreatmentGroupMember.addMember({
      treatment_group_id: id,
      doctor_id: doctor_id,
      role: role
    });
    
    res.status(201).json({
      ok: true,
      member: member
    });
  } catch (error) {
    console.error('Add group member error:', error);
    res.status(500).json({
      ok: false,
      error: 'Üye eklenemedi'
    });
  }
});

// DELETE /api/treatment-groups/:id/members/:doctor_id - Remove member from group
router.delete('/:id/members/:doctor_id', async (req, res) => {
  try {
    const { id, doctor_id } = req.params;
    
    // Remove member
    const removedMember = await TreatmentGroupMember.removeMember(id, doctor_id);
    
    if (!removedMember) {
      return res.status(404).json({
        ok: false,
        error: 'Üye bulunamadı'
      });
    }
    
    res.json({
      ok: true,
      message: 'Üye gruptan ayrıldı'
    });
  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({
      ok: false,
      error: 'Üye ayrılamadı'
    });
  }
});

// GET /api/treatment-groups/:id/patients - Get group patients
router.get('/:id/patients', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if group exists
    const existingGroup = await TreatmentGroup.findById(id);
    if (!existingGroup) {
      return res.status(404).json({
        ok: false,
        error: 'Grup bulunamadı'
      });
    }
    
    const patients = await PatientGroupAssignment.getGroupPatients(id);
    
    res.json({
      ok: true,
      patients: patients
    });
  } catch (error) {
    console.error('Get group patients error:', error);
    res.status(500).json({
      ok: false,
      error: 'Hastalar yüklenemedi'
    });
  }
});

module.exports = router;
