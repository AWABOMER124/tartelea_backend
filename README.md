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

## Docker

```bash
docker compose up -d --build
```

The API will be available at `http://localhost:3000/api/v1`.

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
