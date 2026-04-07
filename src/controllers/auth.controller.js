const AuthService = require('../services/auth.service');
const { success, error } = require('../utils/response');

class AuthController {
  static async signup(req, res, next) {
    try {
      const result = await AuthService.signup(req.body);
      return success(res, result, 'تم إرسال كود التحقق إلى بريدك الإلكتروني', 201);
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmail(req, res, next) {
    try {
      const { email, code } = req.body;
      const result = await AuthService.verifyEmail(email, code);
      return success(res, result, 'تم تفعيل الحساب بنجاح');
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      return success(res, result, 'تم تسجيل الدخول بنجاح');
    } catch (err) {
      next(err);
    }
  }

  static async googleLogin(req, res, next) {
    try {
      const { idToken } = req.body;
      const result = await AuthService.googleLogin(idToken);
      return success(res, result, 'تم تسجيل الدخول عبر قوقل بنجاح');
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
      return success(res, result, 'تم إرسال كود استعادة كلمة المرور');
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { otp, newPassword } = req.body;
      const result = await AuthService.resetPassword(otp, newPassword);
      return success(res, result, 'تم تغيير كلمة المرور بنجاح');
    } catch (err) {
      next(err);
    }
  }

  static async me(req, res, next) {
    try {
      const result = await AuthService.me(req.user.id);
      return success(res, result);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = AuthController;
