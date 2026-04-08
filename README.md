# Tartelea Backend API

A production-ready, modular SaaS backend for the Tartelea Mobile Application.

## 🚀 Features

- **Modular Architecture**: Clean separation of concerns (Controllers, Services, Models, Routes).
- **Authentication**: JWT-based auth with Role-Based Access Control (RBAC).
- **Security**: Hardened with Helmet, CORS, and Rate Limiting.
- **Validation**: Strict request validation using Zod schemas.
- **Database**: PostgreSQL with structured query abstraction.
- **Logging**: Centralized, structured logging with Winston.
- **Nodemailer/Media**: Secure file uploads and processing.
- **DevOps**: Optimized Docker and Docker-Compose setup.

## 🛠 Prerequisites

- Node.js (v20+)
- PostgreSQL (v15+)
- Docker & Docker Compose (optional for local dev)

## 📦 Setup & Installation

1. **Clone and Install Dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and fill in your credentials.
   ```bash
   cp .env.example .env
   ```

3. **Database Setup**:
   Ensure PostgreSQL is running and the database specified in `.env` exists. You can initialize the schema using:
   ```bash
   psql -U your_user -d your_db -f schema.sql
   ```
   Or run the setup script, which also uses `backend/schema.sql` as the single schema source:
   ```bash
   node scripts/setup_db.js
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

## 🐳 Docker Deployment

To run the entire stack (App + Database) using Docker:

```bash
docker compose up -d --build
```

Access the API at `http://localhost:3000/api/v1` and monitor health at `/api/v1/health`.

## 📡 API Overview

| Route | Method | Description | Auth |
|-------|--------|-------------|------|
| `/api/v1/auth/signup` | POST | Create a new user | No |
| `/api/v1/auth/login` | POST | Authenticate & get JWT | No |
| `/api/v1/auth/google` | POST | Google OAuth2 Sign-In | No |
| `/api/v1/profiles/:id` | GET | Get user profile | No |
| `/api/v1/profiles/:id` | PUT | Update user profile | Yes (Owner) |
| `/api/v1/posts` | GET | List community posts | No |
| `/api/v1/posts` | POST | Create a new post | Yes |
| `/api/v1/contents` | GET | List library content | No |
| `/api/v1/media/upload` | POST | Upload a file | Yes |

## 📁 Project Structure

```text
/src
  /config         # Environment and global configs
  /controllers    # Request handlers
  /db             # Database connection pool
  /middlewares    # Auth, validation, error handling
  /models         # Database query abstraction
  /routes         # API routing
  /services       # Business logic
  /utils          # Helper functions / Loggers
  app.js          # Express app configuration
  server.js       # Server entry point
```

## 🧪 Testing

```bash
npm test
```

## 📜 License

ISC
# tartelea_backend
