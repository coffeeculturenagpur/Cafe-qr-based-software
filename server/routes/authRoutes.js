const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.post('/otp/request', authController.requestOtp);
router.post('/otp/verify', authController.verifyOtp);

module.exports = router;
