const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const multer = require('multer');

// Multer config for patient photo uploads (intraoral, profile, etc.)
const patientPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type'), false);
  }
});

// Intraoral photo upload
router.post('/upload-intraoral-photos', patientPhotoUpload.array('photos', 5), patientController.uploadIntraoralPhotos);



// Medical form endpoints
router.get('/:patientId/medical-form', patientController.getMedicalForm);
router.post('/:patientId/medical-form', patientController.saveMedicalForm);


// Patient login
router.post('/login', patientController.patientLogin);


// Referral info
router.get('/referral', patientController.getReferralInfo);


// Language preference
router.patch('/language', patientController.updateLanguage);


// Patient me (status)
router.get('/me', patientController.getPatientMe);

module.exports = router;
