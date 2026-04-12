# Tartelea Backend API

Production-focused Express backend for the Tartelea platform.

## Features

- Modular architecture with controllers, models, services, validators, and routes
- JWT authentication with role-aware access control
- PostgreSQL integration through a shared connection pool
- Zod request validation
- Real-time audio room token flow through LiveKit
- Unified JSON responses for mobile clients
- Docker-friendly local and server deployment

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Docker and Docker Compose (optional)

## Setup

1. Install dependencies:

```bash
cd backend
npm install
```

2. Create your local environment file:

```bash
cp .env.example .env
```

Important:

- The backend reads `backend/.env`.
- The repository root `.env` belongs to the web app and must not be used as the backend config.

3. Create the target PostgreSQL database, then apply the schema:

```bash
psql -U your_user -d your_db -f schema.sql
```

Or use the setup script that reads from `backend/schema.sql`:

```bash
npm run setup:db
```

4. Start the API:

```bash
npm run dev
```

## Auth And Email Flags

The backend can run even when SMTP is unavailable.

Useful flags in `backend/.env`:

```env
EMAIL_ENABLED=false
REQUIRE_EMAIL_VERIFICATION=false
AUTO_VERIFY_EMAIL=true
OTP_DEV_FALLBACK=true
SUBSCRIPTIONS_PAUSED=true
TRAINER_EMAILS=awabomer124@gmail.com
```

Recommended development or staging behavior while SMTP is down:

- `EMAIL_ENABLED=false`
- `REQUIRE_EMAIL_VERIFICATION=false`
- `AUTO_VERIFY_EMAIL=true`
- `OTP_DEV_FALLBACK=true`

What each flag does:

- `EMAIL_ENABLED=false`: skips SMTP send attempts entirely
- `REQUIRE_EMAIL_VERIFICATION=false`: email verification no longer blocks signup/login
- `AUTO_VERIFY_EMAIL=true`: new and legacy unverified users are marked verified automatically during auth flows
- `OTP_DEV_FALLBACK=true`: generates OTP fallback for non-production password-reset or verification testing
- `SUBSCRIPTIONS_PAUSED=true`: pauses subscription responses for test runs
- `TRAINER_EMAILS`: comma-separated emails that should be auto-granted `trainer` role on auth flows

Production safety note:

- OTP fallback is never exposed in production responses
- SMTP-dependent flows return readable errors instead of crashing the auth flow
- Google sign-in remains independent from SMTP

## Docker

```bash
docker compose up -d --build
```

The API will be available at `http://localhost:3000/api/v1`.

`backend/docker-compose.yml` now uses `backend/.env` explicitly through `env_file`.

## Health Check

```text
GET /api/v1/health
```

Example response:

```json
{
  "success": true,
  "status": "UP",
  "timestamp": "2026-04-08T00:00:00.000Z",
  "service": "tartelea-backend",
  "version": "1.0.0"
}
```

## Common Scripts

```bash
npm run dev
npm run setup:db
npm test
```

## Project Structure

```text
src/
  config/
  controllers/
  db/
  middlewares/
  models/
  routes/
  services/
  utils/
  app.js
  server.js
schema.sql
scripts/setup_db.js
test/
```

## Notes

- `backend/schema.sql` is the single schema source of truth.
- `backend/src/db/schema.sql` is intentionally deprecated and should not be used for setup.
- Use environment variables for secrets. Do not commit `.env`.
- If SMTP is unreachable, signup/login/JWT auth still work when the auth flags above are enabled.
- Password reset and verification use dev fallback behavior only outside production.
