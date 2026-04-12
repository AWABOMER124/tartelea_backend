const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Profile = require('../models/Profile');
const EmailService = require('./email.service');
const { connect } = require('../db');
const env = require('../config/env');
const { httpError } = require('../utils/httpError');
const logger = require('../utils/logger');

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const normalizeEmail = (email) => email.trim().toLowerCase();

const maskEmail = (email) => {
  const [localPart = '', domainPart = ''] = email.split('@');
  if (!domainPart) {
    return email;
  }

  const visibleLocal = localPart.slice(0, 2);
  return `${visibleLocal}${'*'.repeat(Math.max(localPart.length - 2, 0))}@${domainPart}`;
};

class AuthService {
  static async signup(data) {
    const email = normalizeEmail(data.email);
    const password = data.password;
    const fullName = data.full_name?.trim() || null;
    const country = data.country?.trim() || null;

    logger.info('[AUTH][SIGNUP] request received', { email: maskEmail(email) });

    const client = await connect();

    try {
      await client.query('BEGIN');

      let user = await User.findByEmail(email);

      if (user && this._isGoogleAccount(user)) {
        throw httpError(
          409,
          'This email is already linked to Google sign-in. Please continue with Google.',
          'GOOGLE_SIGN_IN_REQUIRED'
        );
      }

      if (user && user.is_verified) {
        throw httpError(409, 'Email already registered', 'EMAIL_ALREADY_REGISTERED');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      if (user) {
        await User.updatePassword(client, user.id, hashedPassword);
        await Profile.upsert(client, user.id, email, fullName, null, country);
        await User.assignRole(client, user.id, 'student');
        logger.info('[AUTH][SIGNUP] pending user refreshed', {
          email: maskEmail(email),
          userId: user.id,
        });
      } else {
        user = await User.create(client, email, hashedPassword);
        await Profile.upsert(client, user.id, email, fullName, null, country);
        await User.assignRole(client, user.id, 'student');
        logger.info('[AUTH][SIGNUP] user created', {
          email: maskEmail(email),
          userId: user.id,
        });
      }

      const verificationState = await this._finalizeSignupVerification(client, user.id, email);
      await client.query('COMMIT');

      const authUser = await this._loadAuthUser(user.id);

      if (verificationState.needsVerification) {
        return this._compact({
          message: verificationState.message,
          user: authUser,
          needsVerification: true,
          emailVerificationPending: true,
          emailDelivery: verificationState.emailDelivery,
          devOtp: verificationState.devOtp,
        });
      }

      const token = this.generateToken({
        id: user.id,
        email,
        roles: authUser.roles || ['student'],
      });

      logger.info('[AUTH][JWT] token issued', {
        source: 'signup',
        userId: user.id,
      });

      return {
        message: verificationState.message,
        user: authUser,
        token,
        needsVerification: false,
        emailVerificationPending: false,
        emailDelivery: verificationState.emailDelivery,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.message.includes('unique constraint') || err.message.includes('already exists')) {
        throw httpError(409, 'Email already registered', 'EMAIL_ALREADY_REGISTERED');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  static async verifyEmail(email, code) {
    const normalizedEmail = normalizeEmail(email);
    logger.info('[AUTH][VERIFY] verification attempt', {
      email: maskEmail(normalizedEmail),
    });

    const user = await User.findByVerificationCode(code);

    if (!user || normalizeEmail(user.email) !== normalizedEmail) {
      throw httpError(400, 'Invalid or expired verification code', 'INVALID_VERIFICATION_CODE');
    }

    const client = await connect();
    try {
      await client.query('BEGIN');
      await User.verifyEmail(client, user.id);
      await client.query('COMMIT');

      const authUser = await this._loadAuthUser(user.id);
      const token = this.generateToken({
        id: user.id,
        email: normalizedEmail,
        roles: authUser.roles || user.roles || ['student'],
      });

      logger.info('[AUTH][JWT] token issued', {
        source: 'verify-email',
        userId: user.id,
      });

      return {
        message: 'Email verified successfully',
        user: authUser,
        token,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async login(email, password) {
    const normalizedEmail = normalizeEmail(email);
    logger.info('[AUTH][LOGIN] request received', { email: maskEmail(normalizedEmail) });

    let user = await User.findByEmail(normalizedEmail);

    if (!user) {
      throw httpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (this._isGoogleAccount(user)) {
      throw httpError(
        409,
        'This account uses Google sign-in. Please continue with Google.',
        'GOOGLE_SIGN_IN_REQUIRED'
      );
    }

    if (!user.is_verified && this._shouldBypassEmailVerification()) {
      await this._markUserVerified(user.id, 'login-bypass');
      user = { ...user, is_verified: true };
    }

    if (!user.is_verified) {
      const resendState = await this._resendVerificationCode(user.id, normalizedEmail);
      throw httpError(403, resendState.message, 'EMAIL_NOT_VERIFIED');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    logger.info('[AUTH][LOGIN] password comparison finished', {
      userId: user.id,
      isValid,
    });

    if (!isValid) {
      throw httpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const authUser = await this._loadAuthUser(user.id);
    const token = this.generateToken({
      id: user.id,
      email: normalizedEmail,
      roles: authUser.roles || user.roles || ['student'],
    });

    logger.info('[AUTH][JWT] token issued', {
      source: 'login',
      userId: user.id,
    });

    return {
      message: 'Login successful',
      user: authUser,
      token,
    };
  }

  static async googleLogin(idToken) {
    logger.info('[AUTH][GOOGLE] auth flow started');

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const email = normalizeEmail(payload.email);
      const { name, picture, sub: googleId } = payload;

      logger.info('[AUTH][GOOGLE] token verified', {
        email: maskEmail(email),
      });

      let user = await User.findByEmail(email);

      if (!user) {
        const client = await connect();

        try {
          await client.query('BEGIN');
          const newUser = await User.create(client, email, `GOOGLE_${googleId}`);
          await Profile.upsert(client, newUser.id, email, name, picture);
          await User.verifyEmail(client, newUser.id);
          await User.assignRole(client, newUser.id, 'student');
          await client.query('COMMIT');

          user = await User.findById(newUser.id);
          logger.info('[AUTH][GOOGLE] new Google user created', {
            userId: newUser.id,
            email: maskEmail(email),
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } else {
        const client = await connect();

        try {
          await client.query('BEGIN');
          await Profile.upsert(client, user.id, email, name, picture);
          if (!user.is_verified) {
            await User.verifyEmail(client, user.id);
          }
          await client.query('COMMIT');
          logger.info('[AUTH][GOOGLE] existing user profile synced', {
            userId: user.id,
            email: maskEmail(email),
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      const authUser = await this._loadAuthUser(user.id);
      const token = this.generateToken({
        id: user.id,
        email,
        roles: authUser.roles || user.roles || ['student'],
      });

      logger.info('[AUTH][JWT] token issued', {
        source: 'google',
        userId: user.id,
      });

      return {
        message: 'Google login successful',
        user: authUser,
        token,
      };
    } catch (err) {
      logger.error('[AUTH][GOOGLE] auth failed', {
        error: err.message,
        errorCode: err.code,
      });

      if (err.status) {
        throw err;
      }

      throw httpError(401, `Google sign-in failed: ${err.message}`, 'GOOGLE_LOGIN_FAILED');
    }
  }

  static async forgotPassword(email) {
    const normalizedEmail = normalizeEmail(email);
    logger.info('[AUTH][RESET] request received', {
      email: maskEmail(normalizedEmail),
    });

    let user = await User.findByEmail(normalizedEmail);

    if (!user) {
      throw httpError(404, 'Email not found', 'EMAIL_NOT_FOUND');
    }

    if (this._isGoogleAccount(user)) {
      throw httpError(
        409,
        'This account uses Google sign-in. Please continue with Google.',
        'GOOGLE_SIGN_IN_REQUIRED'
      );
    }

    if (!user.is_verified && this._shouldBypassEmailVerification()) {
      await this._markUserVerified(user.id, 'password-reset-bypass');
      user = { ...user, is_verified: true };
    }

    if (!user.is_verified) {
      const resendState = await this._resendVerificationCode(user.id, normalizedEmail);
      throw httpError(403, resendState.message, 'EMAIL_NOT_VERIFIED');
    }

    const client = await connect();
    const otp = this._generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    try {
      await client.query('BEGIN');
      await User.saveResetToken(client, user.id, otp, expiresAt);

      const sendResult = await EmailService.sendPasswordResetCode(normalizedEmail, otp);
      const resetState = this._buildPasswordResetDeliveryState(sendResult, otp, normalizedEmail);

      if (!resetState.canProceed) {
        await client.query('ROLLBACK');
        throw httpError(
          503,
          resetState.message,
          resetState.errorCode || 'EMAIL_SERVICE_UNAVAILABLE'
        );
      }

      await client.query('COMMIT');
      return this._compact(resetState.payload);
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        // ignore rollback failures
      }
      throw err;
    } finally {
      client.release();
    }
  }

  static async resetPassword(otp, newPassword) {
    logger.info('[AUTH][RESET] password reset confirmation received');

    const user = await User.findByResetToken(otp);
    if (!user) {
      throw httpError(400, 'Invalid or expired reset code', 'INVALID_RESET_CODE');
    }

    if (new Date(user.reset_token_expires) < new Date()) {
      throw httpError(400, 'Reset code has expired', 'EXPIRED_RESET_CODE');
    }

    const client = await connect();
    try {
      await client.query('BEGIN');
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await User.updatePassword(client, user.id, hashedPassword);
      await client.query('COMMIT');

      logger.info('[AUTH][RESET] password updated', { userId: user.id });

      return { message: 'Password reset successfully' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async me(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw httpError(404, 'User not found', 'USER_NOT_FOUND');
    }

    return this._loadAuthUser(userId);
  }

  static _shouldBypassEmailVerification() {
    return env.AUTO_VERIFY_EMAIL || !env.REQUIRE_EMAIL_VERIFICATION;
  }

  static async _markUserVerified(userId, reason) {
    const client = await connect();

    try {
      await client.query('BEGIN');
      await User.verifyEmail(client, userId);
      await client.query('COMMIT');
      logger.info('[AUTH][EMAIL] verification bypassed by config', {
        userId,
        reason,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async _finalizeSignupVerification(client, userId, email) {
    if (this._shouldBypassEmailVerification()) {
      await User.verifyEmail(client, userId);

      const bypassReason = env.AUTO_VERIFY_EMAIL ? 'auto-verify-enabled' : 'verification-disabled';
      logger.info('[AUTH][SIGNUP] email verification bypassed', {
        userId,
        reason: bypassReason,
      });

      return {
        needsVerification: false,
        message: env.AUTO_VERIFY_EMAIL
          ? 'Account created. Email verification was auto-completed by server config.'
          : 'Account created. Email verification is currently bypassed by server config.',
        emailDelivery: {
          enabled: env.EMAIL_ENABLED,
          required: false,
          delivered: false,
          mode: bypassReason,
          reason: null,
        },
      };
    }

    const otp = this._generateOtp();
    await User.saveVerificationCode(client, userId, otp);
    const sendResult = await EmailService.sendVerificationCode(email, otp);

    return this._buildSignupDeliveryState(sendResult, otp, email);
  }

  static _buildSignupDeliveryState(sendResult, otp, email) {
    if (sendResult.delivered) {
      return {
        needsVerification: true,
        message: 'Account created. Verification code sent to your email.',
        emailDelivery: {
          enabled: env.EMAIL_ENABLED,
          required: true,
          delivered: true,
          mode: sendResult.mode,
          reason: null,
        },
      };
    }

    if (EmailService.canUseDevOtpFallback()) {
      logger.warn('[AUTH][EMAIL] using development OTP fallback', {
        flow: 'signup',
        email: maskEmail(email),
        otp,
        reason: sendResult.reason,
      });

      return {
        needsVerification: true,
        message: 'Account created. Email service is unavailable, so development OTP fallback is active.',
        emailDelivery: {
          enabled: env.EMAIL_ENABLED,
          required: true,
          delivered: false,
          mode: 'dev-fallback',
          reason: sendResult.reason,
        },
        devOtp: otp,
      };
    }

    logger.warn('[AUTH][EMAIL] verification delivery unavailable after signup', {
      email: maskEmail(email),
      reason: sendResult.reason,
    });

    return {
      needsVerification: true,
      message: 'Account created, but email verification could not be sent because email service is unavailable.',
      emailDelivery: {
        enabled: env.EMAIL_ENABLED,
        required: true,
        delivered: false,
        mode: sendResult.mode,
        reason: sendResult.reason,
      },
    };
  }

  static _buildPasswordResetDeliveryState(sendResult, otp, email) {
    if (sendResult.delivered) {
      return {
        canProceed: true,
        payload: {
          message: 'Password reset code sent to your email',
          passwordResetPending: true,
          emailDelivery: {
            enabled: env.EMAIL_ENABLED,
            delivered: true,
            mode: sendResult.mode,
            reason: null,
          },
        },
      };
    }

    if (EmailService.canUseDevOtpFallback()) {
      logger.warn('[AUTH][EMAIL] using development OTP fallback', {
        flow: 'password-reset',
        email: maskEmail(email),
        otp,
        reason: sendResult.reason,
      });

      return {
        canProceed: true,
        payload: {
          message: 'Password reset OTP generated using development fallback.',
          passwordResetPending: true,
          emailDelivery: {
            enabled: env.EMAIL_ENABLED,
            delivered: false,
            mode: 'dev-fallback',
            reason: sendResult.reason,
          },
          devOtp: otp,
        },
      };
    }

    logger.warn('[AUTH][EMAIL] password reset delivery unavailable', {
      email: maskEmail(email),
      reason: sendResult.reason,
    });

    return {
      canProceed: false,
      message: 'Password reset is temporarily unavailable because email service is down.',
      errorCode: sendResult.reason === 'EMAIL_DISABLED' ? 'EMAIL_DISABLED' : 'EMAIL_SERVICE_UNAVAILABLE',
    };
  }

  static async _resendVerificationCode(userId, email) {
    const client = await connect();

    try {
      await client.query('BEGIN');
      const otp = this._generateOtp();
      await User.saveVerificationCode(client, userId, otp);
      const sendResult = await EmailService.sendVerificationCode(email, otp);
      await client.query('COMMIT');

      if (sendResult.delivered) {
        return {
          message: 'Please verify your email first. A new verification code has been sent.',
        };
      }

      if (EmailService.canUseDevOtpFallback()) {
        logger.warn('[AUTH][EMAIL] using development OTP fallback', {
          flow: 'resend-verification',
          email: maskEmail(email),
          otp,
          reason: sendResult.reason,
        });

        return {
          message:
            'Please verify your email first. A new verification code has been generated using development fallback.',
        };
      }

      logger.warn('[AUTH][EMAIL] resend verification delivery unavailable', {
        email: maskEmail(email),
        reason: sendResult.reason,
      });

      return {
        message:
          'Please verify your email first. Email delivery is currently unavailable, so a new verification code could not be sent.',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async _loadAuthUser(userId) {
    const profile = await Profile.findById(userId);
    if (!profile) {
      throw httpError(404, 'User profile not found', 'USER_PROFILE_NOT_FOUND');
    }

    const roles = profile.roles || [];
    return {
      ...profile,
      roles,
      role: roles.includes('admin')
        ? 'admin'
        : roles.includes('trainer')
          ? 'trainer'
          : 'student',
    };
  }

  static _generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static _isGoogleAccount(user) {
    return !user.password_hash || user.password_hash.startsWith('GOOGLE_');
  }

  static _compact(payload) {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  }

  static generateToken(payload) {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' });
  }
}

module.exports = AuthService;
