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

class AuthService {
  static async signup(data) {
    const email = normalizeEmail(data.email);
    const password = data.password;
    const fullName = data.full_name?.trim() || null;
    const country = data.country?.trim() || null;
    const client = await connect();

    try {
      await client.query('BEGIN');

      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        if (this._isGoogleAccount(existingUser)) {
          throw httpError(
            409,
            'This email is already linked to Google sign-in. Please continue with Google.',
            'GOOGLE_SIGN_IN_REQUIRED'
          );
        }

        if (existingUser.is_verified) {
          throw httpError(409, 'Email already registered', 'EMAIL_ALREADY_REGISTERED');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await User.updatePassword(client, existingUser.id, hashedPassword);
        await Profile.upsert(client, existingUser.id, email, fullName, null, country);
        await User.assignRole(client, existingUser.id, 'student');
        await this._issueVerificationCode(client, existingUser.id, email);
        await client.query('COMMIT');

        return {
          success: true,
          message: 'Verification code resent to your email',
          email,
          needsVerification: true,
        };
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create(client, email, hashedPassword);
      await Profile.upsert(client, user.id, email, fullName, null, country);
      await User.assignRole(client, user.id, 'student');
      await this._issueVerificationCode(client, user.id, email);

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Verification code sent to your email',
        email,
        needsVerification: true,
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
    const user = await User.findByVerificationCode(code);

    if (!user || normalizeEmail(user.email) !== normalizedEmail) {
      throw httpError(400, 'Invalid or expired verification code', 'INVALID_VERIFICATION_CODE');
    }

    const client = await connect();
    try {
      await client.query('BEGIN');
      await User.verifyEmail(client, user.id);
      await client.query('COMMIT');

      const profile = await Profile.findById(user.id);
      const token = this.generateToken({ id: user.id, email: user.email, roles: user.roles });

      return { user: { ...profile, roles: user.roles }, token };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async login(email, password) {
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findByEmail(normalizedEmail);

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

    if (!user.is_verified) {
      await this._resendVerificationCode(user.id, normalizedEmail);
      throw httpError(
        403,
        'Please verify your email first. A new verification code has been sent.',
        'EMAIL_NOT_VERIFIED'
      );
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw httpError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const profile = await Profile.findById(user.id);
    const token = this.generateToken({ id: user.id, email: user.email, roles: user.roles });

    return {
      user: { ...profile, roles: user.roles },
      token,
    };
  }

  static async googleLogin(idToken) {
    logger.info('[GOOGLE] Starting token verification...');

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const email = normalizeEmail(payload.email);
      const { name, picture, sub: googleId } = payload;
      logger.info(`[GOOGLE] Token verified for: ${email}`);

      let user = await User.findByEmail(email);

      if (!user) {
        logger.info(`[GOOGLE] User ${email} not found. Creating new account...`);
        const client = await connect();
        try {
          await client.query('BEGIN');
          const newUser = await User.create(client, email, `GOOGLE_${googleId}`);
          await Profile.upsert(client, newUser.id, email, name, picture);
          await User.verifyEmail(client, newUser.id);
          await User.assignRole(client, newUser.id, 'student');
          await client.query('COMMIT');

          user = await User.findById(newUser.id);
          logger.info(`[GOOGLE] New user registered successfully: ${user.id}`);
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`[GOOGLE] Transaction failed: ${err.message}`);
          throw err;
        } finally {
          client.release();
        }
      } else {
        logger.info(`[GOOGLE] Existing user found: ${user.id}. Syncing profile...`);
        const client = await connect();
        try {
          await client.query('BEGIN');
          await Profile.upsert(client, user.id, email, name, picture);
          if (!user.is_verified) {
            await User.verifyEmail(client, user.id);
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      const profile = await Profile.findById(user.id);
      const roles = user.roles || ['student'];
      const role = roles.includes('admin')
        ? 'admin'
        : roles.includes('trainer')
          ? 'trainer'
          : 'student';
      const token = this.generateToken({ id: user.id, email: email, roles });

      logger.info(`[GOOGLE] Auth flow completed successfully for ${email}`);
      return {
        user: { ...profile, role, roles },
        token,
      };
    } catch (err) {
      logger.error(`[GOOGLE] Auth failed: ${err.message}`);
      if (err.status) {
        throw err;
      }
      throw httpError(401, `Google sign-in failed: ${err.message}`, 'GOOGLE_LOGIN_FAILED');
    }
  }

  static async forgotPassword(email) {
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findByEmail(normalizedEmail);

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

    if (!user.is_verified) {
      await this._resendVerificationCode(user.id, normalizedEmail);
      throw httpError(
        403,
        'Please verify your email before resetting the password. A new verification code has been sent.',
        'EMAIL_NOT_VERIFIED'
      );
    }

    const client = await connect();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    try {
      await User.saveResetToken(client, user.id, otp, expiresAt);
      await EmailService.sendPasswordResetCode(normalizedEmail, otp);
      return { message: 'Password reset code sent to your email' };
    } finally {
      client.release();
    }
  }

  static async resetPassword(otp, newPassword) {
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

    const profile = await Profile.findById(userId);
    const roles = user.roles || [];
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

  static _isGoogleAccount(user) {
    return !user.password_hash || user.password_hash.startsWith('GOOGLE_');
  }

  static async _issueVerificationCode(client, userId, email) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await User.saveVerificationCode(client, userId, otp);
    await EmailService.sendVerificationCode(email, otp);
  }

  static async _resendVerificationCode(userId, email) {
    const client = await connect();
    try {
      await client.query('BEGIN');
      await this._issueVerificationCode(client, userId, email);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static generateToken(payload) {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' });
  }
}

module.exports = AuthService;
