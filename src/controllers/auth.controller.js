const AuthService = require('../services/auth.service');
const { success } = require('../utils/response');

class AuthController {
  static async signup(req, res, next) {
    try {
      const result = await AuthService.signup(req.body);
      return success(res, result, 'Verification code sent to your email', 201);
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmail(req, res, next) {
    try {
      const { email, code } = req.body;
      const result = await AuthService.verifyEmail(email, code);
      return success(res, result, 'Email verified successfully');
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      return success(res, result, 'Login successful');
    } catch (err) {
      next(err);
    }
  }

  static async googleLogin(req, res, next) {
    try {
      const { idToken } = req.body;
      const result = await AuthService.googleLogin(idToken);
      return success(res, result, 'Google login successful');
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
      return success(res, result, 'Password reset code sent to your email');
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { otp, newPassword } = req.body;
      const result = await AuthService.resetPassword(otp, newPassword);
      return success(res, result, 'Password reset successful');
    } catch (err) {
      next(err);
    }
  }

  static async me(req, res, next) {
    try {
      const result = await AuthService.me(req.user.id);
      return success(res, result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuthController;
