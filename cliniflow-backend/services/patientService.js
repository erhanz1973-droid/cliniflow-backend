// services/patientService.js
// Business logic for patient-related endpoints

const supabase = require('../lib/supabase');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = process.env;

module.exports = {
  // GET /api/patient/:patientId/medical-form
  async getMedicalForm(/* params */) {
    // TODO: Move business logic from controller
  },

  // POST /api/patient/:patientId/medical-form
  async saveMedicalForm(/* params */) {
    // TODO: Move business logic from controller
  },

  // POST /api/patient/login
  async patientLogin(/* params */) {
    // TODO: Move business logic from controller
  },

  // GET /api/patient/referral
  async getReferralInfo(/* params */) {
    // TODO: Move business logic from controller
  },

  // PATCH /api/patient/language
  async updateLanguage(/* params */) {
    // TODO: Move business logic from controller
  },

  // GET /api/patient/me
  async getPatientMe(/* params */) {
    // TODO: Move business logic from controller
  },
};
