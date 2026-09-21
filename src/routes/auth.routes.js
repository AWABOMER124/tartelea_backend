const express = require('express');
const rateLimit = require('express-rate-limit');
const AuthController = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const { authenticateUser: auth } = require('../middlewares/auth');
const {
  signupSchema,
  verifyEmailSchema,
  loginSchema,
  googleLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../middlewares/validators/auth.validator');

const router = express.Router();

const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts. Please try again later.' },
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many recovery attempts. Please try again later.' },
});

router.post('/signup', authAttemptLimiter, validate(signupSchema), AuthController.signup);
router.post('/verify-email', recoveryLimiter, validate(verifyEmailSchema), AuthController.verifyEmail);
router.post('/login', authAttemptLimiter, validate(loginSchema), AuthController.login);
router.post('/google', authAttemptLimiter, validate(googleLoginSchema), AuthController.googleLogin);
router.post('/forgot-password', recoveryLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', recoveryLimiter, validate(resetPasswordSchema), AuthController.resetPassword);
router.get('/me', auth, AuthController.me);
router.post('/logout', auth, AuthController.logout);

module.exports = router;
