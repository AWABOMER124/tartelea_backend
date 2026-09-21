const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { z } = require('zod');

const defaultEnvPath = path.resolve(__dirname, '../../.env');
const defaultLocalEnvPath = path.resolve(__dirname, '../../.env.local');
const requestedEnvPath = process.env.BACKEND_ENV_FILE
  ? path.resolve(process.cwd(), process.env.BACKEND_ENV_FILE)
  : defaultEnvPath;
const hasLocalEnvOverride = !process.env.BACKEND_ENV_FILE && fs.existsSync(defaultLocalEnvPath);

dotenv.config({ path: requestedEnvPath });

if (hasLocalEnvOverride) {
  dotenv.config({ path: defaultLocalEnvPath, override: true });
}

const booleanFlag = (defaultValue) =>
  z.preprocess((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    return value;
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432'),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  JWT_SECRET: z.string(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('*'),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_ENABLED: booleanFlag(true),
  REQUIRE_EMAIL_VERIFICATION: booleanFlag(true),
  AUTO_VERIFY_EMAIL: booleanFlag(false),
  OTP_DEV_FALLBACK: booleanFlag(false),
  SUBSCRIPTIONS_PAUSED: booleanFlag(false),
  TRAINER_EMAILS: z.string().optional(),
  ALLOW_TRAINER_EMAIL_BOOTSTRAP: booleanFlag(false),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_SECRET_KEY: z.string().optional(),
  LOVABLE_API_KEY: z.string().optional(),
  DIRECTUS_URL: z.string().optional(),
  DIRECTUS_TOKEN: z.string().optional(),
});

const productionSafeEnvSchema = envSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV !== 'production') return;

  if (!data.JWT_SECRET || data.JWT_SECRET.length < 32 || data.JWT_SECRET === 'change_me') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message: 'Production JWT_SECRET must be a strong secret of at least 32 characters.',
    });
  }

  const allowedOrigins = data.ALLOWED_ORIGINS
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ALLOWED_ORIGINS'],
      message: 'Production ALLOWED_ORIGINS must be an explicit non-wildcard allowlist.',
    });
  }

  if (!data.DATABASE_URL && (!data.DB_PASSWORD || data.DB_PASSWORD === 'change_me')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['DB_PASSWORD'],
      message: 'Production database credentials must not use placeholder values.',
    });
  }

  if (data.EMAIL_ENABLED) {
    const requiredEmailKeys = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];
    for (const key of requiredEmailKeys) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when EMAIL_ENABLED=true in production.`,
        });
      }
    }
  }

  if (data.ALLOW_TRAINER_EMAIL_BOOTSTRAP) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ALLOW_TRAINER_EMAIL_BOOTSTRAP'],
      message: 'Trainer email bootstrap must be disabled in production. Grant trainer roles through admin workflows.',
    });
  }

  if (data.OTP_DEV_FALLBACK) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['OTP_DEV_FALLBACK'],
      message: 'OTP_DEV_FALLBACK must be disabled in production.',
    });
  }
});

const result = productionSafeEnvSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:', result.error.format());
  process.exit(1);
}

module.exports = {
  ...result.data,
  ENV_FILE_PATH: requestedEnvPath,
  ENV_LOCAL_FILE_PATH: defaultLocalEnvPath,
  ENV_LOCAL_FILE_LOADED: hasLocalEnvOverride,
};
