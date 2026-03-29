const photoService = require('../services/photoService');

exports.uploadIntraoralPhotos = async (req, res) => {
  return photoService.handleIntraoralPhotoUpload(req, res);
};

// Add more patient controller methods as you extract endpoints

const patientService = require('../services/patientService');

// GET /api/patient/:patientId/medical-form
exports.getMedicalForm = async (req, res) => {
  return patientService.getMedicalForm(req, res);
};

// POST /api/patient/:patientId/medical-form
exports.saveMedicalForm = async (req, res) => {
  return patientService.saveMedicalForm(req, res);
};

// POST /api/patient/login
exports.patientLogin = async (req, res) => {
  return patientService.patientLogin(req, res);
};

// GET /api/patient/referral
exports.getReferralInfo = async (req, res) => {
  return patientService.getReferralInfo(req, res);
};

// PATCH /api/patient/language
exports.updateLanguage = async (req, res) => {
  return patientService.updateLanguage(req, res);
};

// GET /api/patient/me
exports.getPatientMe = async (req, res) => {
  return patientService.getPatientMe(req, res);
};
