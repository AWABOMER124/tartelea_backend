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
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_SECRET_KEY: z.string().optional(),
  LOVABLE_API_KEY: z.string().optional(),
  DIRECTUS_URL: z.string().optional(),
  DIRECTUS_TOKEN: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

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
