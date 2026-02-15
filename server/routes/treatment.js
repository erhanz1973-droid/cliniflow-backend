// server/routes/treatment.js
const express = require('express');
const router = express.Router();
const PatientEncounter = require('../models/PatientEncounter');
const EncounterDiagnosis = require('../models/EncounterDiagnosis');
const TreatmentPlan = require('../models/TreatmentPlan');
const TreatmentItem = require('../models/TreatmentItem');
const TreatmentActivityLog = require('../models/TreatmentActivityLog');
const { authenticateToken, requireDoctor } = require('../middleware/auth');

// Middleware to log activities
const logActivity = (entity_type, action) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entity_id = req.params.id || (JSON.parse(data)?.id);
        if (entity_id) {
          TreatmentActivityLog.create({
            entity_type,
            entity_id,
            action,
            performed_by_user_id: req.user.id,
            performed_by_user_type: 'doctor'
          }).catch(err => console.error('Activity log error:', err));
        }
      }
      originalSend.call(this, data);
    };
    
    next();
  };
};

// ===== ENCOUNTERS =====

// Create new encounter
router.post('/encounters', authenticateToken, requireDoctor, logActivity('encounter', 'create'), async (req, res) => {
  try {
    const { patient_id, encounter_type } = req.body;
    
    // 🔥 CRITICAL: Use req.decoded.doctorId instead of req.user.id
    const doctorId = req.decoded?.doctorId;
    
    if (!doctorId) {
      console.error('[ENCOUNTER CREATE] Missing doctor ID:', { decoded: req.decoded, user: req.user });
      return res.status(400).json({ error: 'Doctor ID not found' });
    }
    
    console.log('[ENCOUNTER CREATE] Creating encounter:', { patient_id, doctor_id: doctorId, encounter_type });
    
    const encounter = await PatientEncounter.create({
      patient_id,
      created_by_doctor_id: doctorId,
      encounter_type: encounter_type || 'initial'
    });
    
    console.log('[ENCOUNTER CREATE] Success:', encounter);
    res.json(encounter);
  } catch (error) {
    console.error('Create encounter error:', error);
    res.status(500).json({ error: 'Failed to create encounter' });
  }
});

// Get encounters for a patient
router.get('/encounters/patient/:patient_id', authenticateToken, requireDoctor, async (req, res) => {
  try {
    const encounters = await PatientEncounter.findByPatientId(req.params.patient_id);
    res.json(encounters);
  } catch (error) {
    console.error('Get encounters error:', error);
    res.status(500).json({ error: 'Failed to get encounters' });
  }
});

// Get single encounter
router.get('/encounters/:id', authenticateToken, requireDoctor, async (req, res) => {
  try {
    const encounter = await PatientEncounter.findById(req.params.id);
    if (!encounter) {
      return res.status(404).json({ error: 'Encounter not found' });
    }
    res.json(encounter);
  } catch (error) {
    console.error('Get encounter error:', error);
    res.status(500).json({ error: 'Failed to get encounter' });
  }
});

// ===== DIAGNOSES =====

// Add diagnosis to encounter
router.post('/encounters/:encounter_id/diagnoses', authenticateToken, requireDoctor, logActivity('diagnosis', 'create'), async (req, res) => {
  try {
    const { icd10_code, icd10_description, is_primary } = req.body;
    
    const diagnosis = await EncounterDiagnosis.create({
      encounter_id: req.params.encounter_id,
      icd10_code,
      icd10_description,
      is_primary,
      created_by_doctor_id: req.user.id
    });
    
    res.json(diagnosis);
  } catch (error) {
    console.error('Create diagnosis error:', error);
    res.status(500).json({ error: 'Failed to create diagnosis' });
  }
});

// Get diagnoses for encounter
router.get('/encounters/:encounter_id/diagnoses', authenticateToken, requireDoctor, async (req, res) => {
  try {
    const diagnoses = await EncounterDiagnosis.findByEncounterId(req.params.encounter_id);
    res.json(diagnoses);
  } catch (error) {
    console.error('Get diagnoses error:', error);
    res.status(500).json({ error: 'Failed to get diagnoses' });
  }
});

// ===== TREATMENT PLANS =====

// Create treatment plan
router.post('/encounters/:encounter_id/treatment-plans', authenticateToken, requireDoctor, logActivity('treatment_plan', 'create'), async (req, res) => {
  try {
    // Check if encounter has primary diagnosis
    const canCreate = await TreatmentPlan.canCreateTreatmentPlan(req.params.encounter_id);
    if (!canCreate.canCreate) {
      return res.status(403).json({ 
        error: 'Cannot create treatment plan', 
        reason: canCreate.reason 
      });
    }
    
    const treatmentPlan = await TreatmentPlan.create({
      encounter_id: req.params.encounter_id,
      created_by_doctor_id: req.user.id
    });
    
    res.json(treatmentPlan);
  } catch (error) {
    console.error('Create treatment plan error:', error);
    res.status(500).json({ error: 'Failed to create treatment plan' });
  }
});

// Get treatment plans for encounter
router.get('/encounters/:encounter_id/treatment-plans', authenticateToken, requireDoctor, async (req, res) => {
  try {
    const plans = await TreatmentPlan.findByEncounterId(req.params.encounter_id);
    res.json(plans);
  } catch (error) {
    console.error('Get treatment plans error:', error);
    res.status(500).json({ error: 'Failed to get treatment plans' });
  }
});

// Update treatment plan status
router.patch('/treatment-plans/:id/status', authenticateToken, requireDoctor, logActivity('treatment_plan', 'update_status'), async (req, res) => {
  try {
    const { status } = req.body;
    
    // Only doctors can propose, only admins can approve
    if (status === 'approved') {
      return res.status(403).json({ error: 'Only admins can approve treatment plans' });
    }
    
    const plan = await TreatmentPlan.updateStatus(req.params.id, status);
    if (!plan) {
      return res.status(404).json({ error: 'Treatment plan not found' });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('Update treatment plan error:', error);
    res.status(500).json({ error: 'Failed to update treatment plan' });
  }
});

// ===== TREATMENT ITEMS =====

// Add treatment item to plan
router.post('/treatment-plans/:plan_id/items', authenticateToken, requireDoctor, logActivity('treatment_item', 'create'), async (req, res) => {
  try {
    const { tooth_fdi_code, procedure_code, procedure_name, linked_icd10_code } = req.body;
    
    const item = await TreatmentItem.create({
      treatment_plan_id: req.params.plan_id,
      tooth_fdi_code,
      procedure_code,
      procedure_name,
      linked_icd10_code,
      created_by_doctor_id: req.user.id
    });
    
    res.json(item);
  } catch (error) {
    console.error('Create treatment item error:', error);
    res.status(500).json({ error: 'Failed to create treatment item' });
  }
});

// Get treatment items for plan
router.get('/treatment-plans/:plan_id/items', authenticateToken, requireDoctor, async (req, res) => {
  try {
    const items = await TreatmentItem.findByTreatmentPlanId(req.params.plan_id);
    res.json(items);
  } catch (error) {
    console.error('Get treatment items error:', error);
    res.status(500).json({ error: 'Failed to get treatment items' });
  }
});

// Get tooth map for plan
router.get('/treatment-plans/:plan_id/tooth-map', authenticateToken, requireDoctor, async (req, res) => {
  try {
    const toothMap = await TreatmentItem.getToothMap(req.params.plan_id);
    res.json(toothMap);
  } catch (error) {
    console.error('Get tooth map error:', error);
    res.status(500).json({ error: 'Failed to get tooth map' });
  }
});

// Update treatment item status
router.patch('/treatment-items/:id/status', authenticateToken, requireDoctor, logActivity('treatment_item', 'update_status'), async (req, res) => {
  try {
    const { status } = req.body;
    
    const item = await TreatmentItem.updateStatus(req.params.id, status, req.user.id);
    if (!item) {
      return res.status(404).json({ error: 'Treatment item not found' });
    }
    
    res.json(item);
  } catch (error) {
    console.error('Update treatment item error:', error);
    res.status(500).json({ error: 'Failed to update treatment item' });
  }
});

module.exports = router;
