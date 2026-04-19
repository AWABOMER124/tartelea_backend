const express = require('express');
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

router.post('/signup', validate(signupSchema), AuthController.signup);
router.post('/verify-email', validate(verifyEmailSchema), AuthController.verifyEmail);
router.post('/login', validate(loginSchema), AuthController.login);
router.post('/google', validate(googleLoginSchema), AuthController.googleLogin);
router.post('/forgot-password', validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), AuthController.resetPassword);
router.get('/me', auth, AuthController.me);
router.post('/logout', auth, AuthController.logout);

module.exports = router;
