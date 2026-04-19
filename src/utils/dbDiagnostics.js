function getDbTarget(env) {
  return env.DATABASE_URL
    ? "DATABASE_URL"
    : `${env.DB_USER}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
}

function describeDbIssue(error, env) {
  const code = error?.code || "UNKNOWN";
  const hostname = error?.hostname || env.DB_HOST;

  if (code === "ENOTFOUND") {
    return {
      summary: `Database host could not be resolved: ${hostname}`,
      hints: [
        "Use DB_HOST=localhost for a host-machine PostgreSQL instance.",
        "Use DB_HOST=db when running inside Docker Compose.",
        "Set DATABASE_URL when using a managed PostgreSQL service.",
      ],
    };
  }

  if (code === "ECONNREFUSED") {
    return {
      summary: `Database is not accepting connections on ${env.DB_HOST}:${env.DB_PORT}.`,
      hints: [
        "Start PostgreSQL locally, or run `docker compose up -d db` from the repository root.",
        "If you already have PostgreSQL running, confirm DB_HOST, DB_PORT, DB_USER, and DB_PASSWORD.",
        "Use DATABASE_URL when connecting to a managed PostgreSQL instance.",
      ],
    };
  }

  if (code === "3D000") {
    return {
      summary: `Database "${env.DB_NAME}" does not exist yet.`,
      hints: [
        "Create the database first, then run `npm run setup:db` inside backend.",
        "If you use Docker Compose, let the db service initialize the schema from backend/schema.sql.",
      ],
    };
  }

  if (code === "28P01") {
    return {
      summary: "PostgreSQL rejected the configured username or password.",
      hints: [
        "Confirm DB_USER and DB_PASSWORD in backend/.env.local or DATABASE_URL.",
        "If you use Docker Compose, reuse the credentials from docker-compose.yml.",
      ],
    };
  }

  return {
    summary: error?.message || "Unknown database connection failure.",
    hints: [
      "Run `npm run check:db` inside backend to print the active environment file and target.",
      "Try backend/.env.local for local-only overrides without editing backend/.env.",
    ],
  };
}

module.exports = {
  describeDbIssue,
  getDbTarget,
};
