const AuthService = require('../services/auth.service');
const SubscriptionService = require('../services/subscription.service');
const logger = require('../utils/logger');
const { success } = require('../utils/response');
const { buildAuthEnvelope, buildSessionEnvelope } = require('../utils/auth-contract');

async function safeGetSubscriptionContract(user) {
  if (!user?.id) {
    return null;
  }

  try {
    return await SubscriptionService.getUserContract(user);
  } catch (err) {
    logger.warn('[AUTH][SUBSCRIPTION] failed to load subscription contract (non-blocking)', {
      userId: user.id,
      error: err?.message,
      code: err?.code,
    });
    return null;
  }
}

class AuthController {
  static async signup(req, res, next) {
    try {
      const result = await AuthService.signup(req.body);
      const { message = 'Signup successful', token, accessToken, refreshToken, user, ...extra } = result;
      const subscription = await safeGetSubscriptionContract(user);
      return success(
        res,
        buildAuthEnvelope({
          user,
          accessToken: accessToken || token || null,
          refreshToken: refreshToken || null,
          extra: {
            ...extra,
            ...(subscription || {}),
            subscription,
          },
        }),
        message,
        201
      );
    } catch (err) {
      next(err);
    }
  }

  static async verifyEmail(req, res, next) {
    try {
      const { email, code } = req.body;
      const result = await AuthService.verifyEmail(email, code);
      const { message = 'Email verified successfully', token, accessToken, refreshToken, user, ...extra } = result;
      const subscription = await safeGetSubscriptionContract(user);
      return success(
        res,
        buildAuthEnvelope({
          user,
          accessToken: accessToken || token || null,
          refreshToken: refreshToken || null,
          extra: {
            ...extra,
            ...(subscription || {}),
            subscription,
          },
        }),
        message
      );
    } catch (err) {
      next(err);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      const { message = 'Login successful', token, accessToken, refreshToken, user, ...extra } = result;
      const subscription = await safeGetSubscriptionContract(user);
      return success(
        res,
        buildAuthEnvelope({
          user,
          accessToken: accessToken || token || null,
          refreshToken: refreshToken || null,
          extra: {
            ...extra,
            ...(subscription || {}),
            subscription,
          },
        }),
        message
      );
    } catch (err) {
      next(err);
    }
  }

  static async googleLogin(req, res, next) {
    try {
      const { idToken } = req.body;
      const result = await AuthService.googleLogin(idToken);
      const { message = 'Google login successful', token, accessToken, refreshToken, user, ...extra } = result;
      const subscription = await safeGetSubscriptionContract(user);
      return success(
        res,
        buildAuthEnvelope({
          user,
          accessToken: accessToken || token || null,
          refreshToken: refreshToken || null,
          extra: {
            ...extra,
            ...(subscription || {}),
            subscription,
          },
        }),
        message
      );
    } catch (err) {
      next(err);
    }
  }

  static async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const result = await AuthService.forgotPassword(email);
      const { message = 'Password reset code sent to your email', ...data } = result;
      return success(res, { ...data, data }, message);
    } catch (err) {
      next(err);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { otp, newPassword } = req.body;
      const result = await AuthService.resetPassword(otp, newPassword);
      const { message = 'Password reset successful', ...data } = result;
      return success(res, { ...data, data }, message);
    } catch (err) {
      next(err);
    }
  }

  static async me(req, res, next) {
    try {
      const result = await AuthService.me(req.user.id);
      const subscription = await safeGetSubscriptionContract(result);
      return success(
        res,
        buildSessionEnvelope({
          user: result,
          extra: {
            ...subscription,
            subscription,
          },
        }),
        'Current user fetched successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  static async logout(req, res, next) {
    try {
      return success(
        res,
        buildAuthEnvelope({
          user: null,
          accessToken: null,
          refreshToken: null,
          extra: {
            loggedOut: true,
          },
        }),
        'Logout acknowledged successfully'
      );
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AuthController;
