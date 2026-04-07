const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Profile = require('../models/Profile');
const EmailService = require('./email.service');
const { connect } = require('../db');
const env = require('../config/env');

const logger = require('../utils/logger');
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

class AuthService {
  static async signup(data) {
    const { email, password, full_name, country } = data;
    const client = await connect();

    try {
      await client.query('BEGIN');

      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        throw new Error('Email already registered');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create(client, email, hashedPassword);
      const profile = await Profile.create(client, user.id, email, full_name, null, country);
      await User.assignRole(client, user.id, 'student');

      // 🛑 Professional Verification Step:
      const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
      await User.saveVerificationCode(client, user.id, otp);
      await EmailService.sendVerificationCode(email, otp);

      await client.query('COMMIT');

      return { 
        success: true, 
        message: 'Verification code sent to your email',
        email: email,
        needsVerification: true 
      };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.message.includes('unique constraint') || err.message.includes('already exists')) {
        throw new Error('Email already registered');
      }
      throw err;
    } finally {
      client.release();
    }
  }

  static async verifyEmail(email, code) {
    const user = await User.findByVerificationCode(code);
    if (!user || user.email !== email) {
      throw new Error('Invalid or expired verification code');
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
    const user = await User.findByEmail(email);
    if (!user) throw new Error('User not found');

    if (!user.password_hash || user.password_hash.startsWith('GOOGLE_')) {
      throw new Error('Please login with Google for this account');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new Error('Invalid credentials');

    const profile = await Profile.findById(user.id);
    const token = this.generateToken({ id: user.id, email: user.email, roles: user.roles });

    return { 
      user: { ...profile, roles: user.roles }, 
      token 
    };
  }

  static async googleLogin(idToken) {
    logger.info('🔍 [GOOGLE] Starting token verification...');
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      const { email, name, picture, sub: googleId } = payload;
      logger.info(`✅ [GOOGLE] Token verified for: ${email}`);
      
      let user = await User.findByEmail(email);

      if (!user) {
        logger.info(`🔍 [GOOGLE] User ${email} not found. Creating new account...`);
        const client = await connect();
        try {
          await client.query('BEGIN');
          const newUser = await User.create(client, email, `GOOGLE_${googleId}`);
          const profile = await Profile.create(client, newUser.id, email, name, picture);
          await User.assignRole(client, newUser.id, 'student');
          await client.query('COMMIT');
          
          user = { ...profile, roles: ['student'] };
          logger.info(`✅ [GOOGLE] New user registered successfully: ${user.id}`);
        } catch (err) {
          await client.query('ROLLBACK');
          logger.error(`❌ [GOOGLE] Transaction failed: ${err.message}`);
          throw err;
        } finally {
          client.release();
        }
      } else {
        logger.info(`🔍 [GOOGLE] Existing user found: ${user.id}. Updating profile sync...`);
        // User exists, fetch their full profile and roles
        let profile = await Profile.findById(user.id);
        
        // SELF-HEALING: If profile is missing (due to legacy DB issues), create it now
        if (!profile) {
          logger.warn(`⚠️ [GOOGLE] Profile missing for user ${user.id}. Creating now...`);
          const client = await connect();
          try {
            await client.query('BEGIN');
            profile = await Profile.create(client, user.id, email, name, picture);
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }
        }
        
        user = { ...profile, roles: user.roles || ['student'] };
      }

      const roles = user.roles || ['student'];
      const role = roles.includes('admin') ? 'admin' : (roles.includes('trainer') ? 'trainer' : 'student');
      const token = this.generateToken({ id: user.id || profile.id, email: user.email || email, roles });
      
      logger.info(`🚀 [GOOGLE] Auth flow completed successfully for ${email}`);
      return { 
        user: { ...user, role, roles }, 
        token 
      };
    } catch (err) {
      logger.error(`❌ [GOOGLE] Auth failed: ${err.message}`);
      throw new Error('فشل تسجيل الدخول عبر قوقل: ' + err.message);
    }
  }

  static async forgotPassword(email) {
    const user = await User.findByEmail(email);
    if (!user) throw new Error('Email not found');

    const client = await connect();
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

    try {
      await User.saveResetToken(client, user.id, otp, expiresAt);
      await EmailService.sendPasswordResetCode(email, otp);
      return { message: 'Password reset code sent to your email' };
    } finally {
      client.release();
    }
  }

  static async resetPassword(otp, newPassword) {
    const user = await User.findByResetToken(otp);
    if (!user) throw new Error('Invalid or expired reset code');

    if (new Date(user.reset_token_expires) < new Date()) {
      throw new Error('Reset code has expired');
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
    if (!user) throw new Error('User not found');

    const profile = await Profile.findById(userId);
    const roles = user.roles || [];
    return { 
      ...profile, 
      roles, 
      role: roles.includes('admin') ? 'admin' : (roles.includes('trainer') ? 'trainer' : 'student') 
    };
  }

  static generateToken(payload) {
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '24h' });
  }
}

module.exports = AuthService;
