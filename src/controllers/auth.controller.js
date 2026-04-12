const AuthService = require('../services/auth.service');
const { success } = require('../utils/response');

class AuthController {
  static async signup(req, res, next) {
    try {
      const result = await AuthService.signup(req.body);
      const { message = 'Signup successful', ...data } = result;
      return success(res, { data }, message, 201);
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmail(req, res, next) {
    try {
      const { email, code } = req.body;
      const result = await AuthService.verifyEmail(email, code);
      const { message = 'Email verified successfully', ...data } = result;
      return success(res, { data }, message);
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      const { message = 'Login successful', ...data } = result;
      return success(res, { data }, message);
    } catch (err) {
      next(err);
    }
  }

  static async googleLogin(req, res, next) {
    try {
      const { idToken } = req.body;
      const result = await AuthService.googleLogin(idToken);
      const { message = 'Google login successful', ...data } = result;
      return success(res, { data }, message);
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
      const { message = 'Password reset code sent to your email', ...data } = result;
      return success(res, { data }, message);
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { otp, newPassword } = req.body;
      const result = await AuthService.resetPassword(otp, newPassword);
      const { message = 'Password reset successful', ...data } = result;
      return success(res, { data }, message);
    } catch (err) {
      next(err);
    }
  }

  static async me(req, res, next) {
    try {
      const result = await AuthService.me(req.user.id);
      return success(res, { data: result }, 'Current user fetched successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuthController;
