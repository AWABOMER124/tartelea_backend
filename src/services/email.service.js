const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

// Create transporter only if SMTP settings are provided, otherwise fallback to mock logging
let transporter = null;

if (env.EMAIL_USER && env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: env.EMAIL_HOST || 'smtp.gmail.com',
    port: env.EMAIL_PORT || 587,
    secure: env.EMAIL_PORT == 465,
    auth: {
      user: env.EMAIL_USER,
      pass: env.EMAIL_PASS,
    },
  });
}

class EmailService {
  static async _send(email, subject, html, logMessage) {
    if (transporter) {
      logger.info(`✉️ [EMAIL] Attempting to send real email to ${email}...`);
      try {
        // Add a 10-second timeout to the sendMail process
        const info = await Promise.race([
          transporter.sendMail({
            from: `"مدرسة الترتيليا" <${env.EMAIL_USER}>`,
            to: email,
            subject,
            html,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP_TIMEOUT')), 10000))
        ]);
        
        logger.info(`✅ [EMAIL] Sent successfully: ${info.messageId}`);
      } catch (err) {
        if (err.message === 'SMTP_TIMEOUT') {
          logger.error(`❌ [EMAIL] SMTP server timed out for ${email}. Check your SMTP settings.`);
        } else {
          logger.error(`❌ [EMAIL] Failed to send email to ${email}: ${err.message}`);
        }
        // Don't rethrow here to allow the main flow to at least respond to the client
      }
    } else {
      // Mock mode for local testing
      logger.info(logMessage);
    }
  }

  static async sendVerificationCode(email, code) {
    const subject = 'تفعيل حساب مدرسة الترتيليا';
    const html = `<h3>أهلاً بك في مدرسة الترتيليا</h3><p>كود التفعيل الخاص بك هو: <b>${code}</b></p>`;
    
    await this._send(email, subject, html, `🔑 VERIFICATION CODE SENT TO: ${email} | CODE: ${code}`);
  }

  static async sendPasswordResetCode(email, code) {
    const subject = 'إعادة تعيين كلمة المرور';
    const html = `<h3>مدرسة الترتيليا</h3><p>كود إعادة تعيين كلمة المرور هو: <b>${code}</b></p>`;
    
    await this._send(email, subject, html, `🔑 PASSWORD RESET SENT TO: ${email} | CODE: ${code}`);
    return true;
  }
}

module.exports = EmailService;
