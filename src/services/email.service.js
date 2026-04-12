const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

const smtpConfigured = Boolean(
  env.EMAIL_HOST && env.EMAIL_PORT && env.EMAIL_USER && env.EMAIL_PASS
);

let transporter = null;

if (env.EMAIL_ENABLED && smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST,
    port: Number(env.EMAIL_PORT),
    secure: String(env.EMAIL_PORT) === '465',
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
  });
}

class EmailService {
  static isEnabled() {
    return env.EMAIL_ENABLED;
  }

  static isConfigured() {
    return env.EMAIL_ENABLED && smtpConfigured;
  }

  static canUseDevOtpFallback() {
    return env.OTP_DEV_FALLBACK && env.NODE_ENV !== 'production';
  }

  static async _send({ email, subject, html, kind }) {
    if (!env.EMAIL_ENABLED) {
      logger.info('[AUTH][EMAIL] disabled by config', { kind, email });
      return {
        delivered: false,
        mode: 'disabled',
        reason: 'EMAIL_DISABLED',
      };
    }

    if (!transporter) {
      logger.warn('[AUTH][EMAIL] SMTP transport is not configured', { kind, email });
      return {
        delivered: false,
        mode: 'not-configured',
        reason: 'EMAIL_NOT_CONFIGURED',
      };
    }

    logger.info('[AUTH][EMAIL] send attempt', { kind, email });

    try {
      const info = await Promise.race([
        transporter.sendMail({
          from: `"Tartelea" <${env.EMAIL_USER}>`,
          to: email,
          subject,
          html,
        }),
        new Promise((_, reject) => {
          setTimeout(() => reject(Object.assign(new Error('SMTP_TIMEOUT'), { code: 'SMTP_TIMEOUT' })), 10000);
        }),
      ]);

      logger.info('[AUTH][EMAIL] send succeeded', {
        kind,
        email,
        messageId: info.messageId,
      });

      return {
        delivered: true,
        mode: 'smtp',
        reason: null,
      };
    } catch (err) {
      const reason = this._mapTransportError(err);

      logger.warn('[AUTH][EMAIL] send failed', {
        kind,
        email,
        reason,
        error: err.message,
        errorCode: err.code,
      });

      return {
        delivered: false,
        mode: 'smtp-failed',
        reason,
      };
    }
  }

  static _mapTransportError(err) {
    if (
      err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ESOCKET' ||
      err.code === 'SMTP_TIMEOUT'
    ) {
      return 'SMTP_UNAVAILABLE';
    }

    return 'EMAIL_DELIVERY_FAILED';
  }

  static async sendVerificationCode(email, code) {
    return this._send({
      email,
      kind: 'verification',
      subject: 'Tartelea account verification',
      html: `<h3>Welcome to Tartelea</h3><p>Your verification code is: <b>${code}</b></p>`,
    });
  }

  static async sendPasswordResetCode(email, code) {
    return this._send({
      email,
      kind: 'password-reset',
      subject: 'Tartelea password reset',
      html: `<h3>Tartelea password reset</h3><p>Your password reset code is: <b>${code}</b></p>`,
    });
  }
}

module.exports = EmailService;
