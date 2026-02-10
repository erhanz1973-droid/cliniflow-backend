// server/routes/patient-group-assignments.js
const express = require('express');
const router = express.Router();
const PatientGroupAssignment = require('../models/PatientGroupAssignment');
const TreatmentGroup = require('../models/TreatmentGroup');
const { authenticateAdmin } = require('../middleware/auth');

// Middleware - Admin only
router.use(authenticateAdmin);

// POST /api/patient-group-assignments - Assign patient to group
router.post('/', async (req, res) => {
  try {
    const { treatment_group_id, patient_id } = req.body;
    
    if (!treatment_group_id || !patient_id) {
      return res.status(400).json({
        ok: false,
        error: 'Grup ID ve hasta ID zorunludur'
      });
    }
    
    // Check if group exists
    const existingGroup = await TreatmentGroup.findById(treatment_group_id);
    if (!existingGroup) {
      return res.status(404).json({
        ok: false,
        error: 'Grup bulunamadı'
      });
    }
    
    // Assign patient
    const assignment = await PatientGroupAssignment.assignPatient({
      treatment_group_id: treatment_group_id,
      patient_id: patient_id,
      assigned_by_admin_id: req.user.id // Admin ID from auth middleware
    });
    
    res.status(201).json({
      ok: true,
      assignment: assignment
    });
  } catch (error) {
    console.error('Assign patient error:', error);
    res.status(500).json({
      ok: false,
      error: 'Hasta atanamadı'
    });
  }
});

// DELETE /api/patient-group-assignments/:patient_id - Unassign patient from group
router.delete('/:patient_id', async (req, res) => {
  try {
    const { patient_id } = req.params;
    
    // Get patient's current assignments
    const patientGroups = await PatientGroupAssignment.getPatientGroups(patient_id);
    
    if (patientGroups.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Hastanın grup ataması bulunmuyor'
      });
    }
    
    // Unassign from primary group (first one)
    const primaryGroup = patientGroups[0];
    const removedAssignment = await PatientGroupAssignment.unassignPatient(
      primaryGroup.id,
      patient_id
    );
    
    res.json({
      ok: true,
      message: 'Hasta gruptan ayrıldı'
    });
  } catch (error) {
    console.error('Unassign patient error:', error);
    res.status(500).json({
      ok: false,
      error: 'Hasta gruptan ayrılamadı'
    });
  }
});

// GET /api/patient-group-assignments - Get all assignments
router.get('/', async (req, res) => {
  try {
    // For now, return empty array - would need to implement getAllAssignments
    res.json({
      ok: true,
      assignments: []
    });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({
      ok: false,
      error: 'Atamalar yüklenemedi'
    });
  }
});

module.exports = router;
