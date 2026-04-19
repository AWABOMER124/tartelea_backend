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
- If `backend/.env.local` exists, it is loaded automatically after `backend/.env` and overrides it for local development.
- The repository root `.env` belongs to the web app and must not be used as the backend config.
- For a host-machine PostgreSQL instance, use `DB_HOST=localhost`.
- For Docker Compose, use `DB_HOST=db` inside the backend container.
- If you have a managed PostgreSQL service, prefer `DATABASE_URL`.

Optional local override:

```bash
cp .env.local.example .env.local
```

Use `backend/.env.local` when you need local-only settings without editing the shared `backend/.env`.

3. Pick one local database story and apply the schema.

Option 1: host-machine PostgreSQL

```bash
cp .env.local.example .env.local
```

Then set one of the following:

- `DB_HOST=localhost`, `DB_PORT=5432`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- or `DATABASE_URL=postgres://user:password@localhost:5432/database`

After that, create the database and apply the schema:

```bash
psql -U your_user -d your_db -f schema.sql
```

Option 2: Docker Compose database

```bash
docker compose up -d db
cp .env.local.example .env.local
```

Then set `DB_HOST=db` inside `backend/.env.local`.

Apply the schema with either `psql` or the setup script that reads from `backend/schema.sql`:

```bash
npm run setup:db
```

4. Run local sanity checks before starting the API:

```bash
npm run check:db
npm run check:subscriptions
npm run sanity:dev
```

What each command verifies:

- `npm run check:db`: basic database reachability and environment diagnostics
- `npm run check:subscriptions`: subscription catalog rows and entitlement wiring
- `npm run sanity:dev`: runs the database check first, then the subscription check if PostgreSQL is reachable

If the database is still unreachable, the backend now prints actionable hints such as:

- use `DB_HOST=localhost` for local PostgreSQL
- use `DB_HOST=db` for Docker Compose
- set `DATABASE_URL` for a managed PostgreSQL service

5. Start the API:

```bash
npm run dev
```

## Troubleshooting Local DB

If `npm run check:db` fails:

- `ENOTFOUND <host>`: the configured host is not resolvable on this machine. Switch to `localhost`, `db`, or a valid managed database host.
- `ECONNREFUSED localhost:5432`: PostgreSQL is not running or not listening on port `5432`.
- `password authentication failed`: credentials in `.env.local` do not match the target database.
- `database "<name>" does not exist`: create the database first, then run `npm run setup:db`.

To validate the subscription catalog once the database is reachable:

```bash
npm run check:subscriptions
```

If the command cannot connect to PostgreSQL, confirm one of the following:

- `backend/.env.local` points to a reachable `localhost` database
- `DATABASE_URL` points to a managed PostgreSQL instance
- Docker Compose is running and the backend is using `DB_HOST=db`

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
npm run check:db
npm run check:subscriptions
npm run sanity:dev
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
- Use `backend/.env.local` for machine-specific overrides. Do not commit `.env.local`.
- If SMTP is unreachable, signup/login/JWT auth still work when the auth flags above are enabled.
- Password reset and verification use dev fallback behavior only outside production.
- Architecture decisions and migration guardrails now live under:
  - `docs/architecture/ARCHITECTURE_DECISION_001_backend_first.md`
  - `docs/architecture/ROLE_MATRIX.md`
  - `docs/architecture/AUTH_CONTRACT.md`
