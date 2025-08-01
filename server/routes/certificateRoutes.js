const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const {
    generateCertificate,
    generateClassCertificates,
    downloadCertificate,
    verifyCertificate,
    getUserCertificates,
    deleteCertificate,
    uploadStudentCertificate,
    uploadCertificateMetadata,
    viewStudentCertificate,
    getAllCertificates
} = require('../controllers/certificateController');

// Admin routes
router.get('/', requireAuth, requireAdmin, getAllCertificates);
router.post('/generate', requireAuth, requireAdmin, generateCertificate);
router.post('/generate-class/:classId', requireAuth, requireAdmin, generateClassCertificates);
router.get('/:id/download', requireAuth, requireAdmin, downloadCertificate);
router.get('/user/:userId', requireAuth, requireAdmin, getUserCertificates);
router.delete('/:id', requireAuth, requireAdmin, deleteCertificate);

// Student certificate routes
router.post('/upload/:studentId', 
    requireAuth, 
    requireAdmin, 
    upload.single('certificate'), // 'certificate' is the field name in the form
    uploadStudentCertificate
);

// New route for Supabase uploads
router.post('/upload-metadata', requireAuth, uploadCertificateMetadata);

router.get('/view/:studentId', requireAuth, viewStudentCertificate);

// Public route for certificate verification
router.get('/verify/:code', verifyCertificate);

module.exports = router; 