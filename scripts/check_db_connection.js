const db = require("../src/db");
const env = require("../src/config/env");
const { describeDbIssue, getDbTarget } = require("../src/utils/dbDiagnostics");

async function checkDbConnection({ closePool = true } = {}) {
  console.log("Checking backend database connection...");
  console.log(`Environment file: ${env.ENV_FILE_PATH}`);

  if (env.ENV_LOCAL_FILE_LOADED) {
    console.log(`Environment override: ${env.ENV_LOCAL_FILE_PATH}`);
  }

  console.log(`Database target: ${getDbTarget(env)}`);

  try {
    const result = await db.query("SELECT 1 AS ok");
    console.log(`Database connection OK: ${result.rows[0]?.ok === 1 ? "SELECT 1 succeeded" : "connected"}`);
    return { ok: true };
  } catch (error) {
    const issue = describeDbIssue(error, env);
    console.error("Database connection check failed.");
    console.error(issue.summary);
    issue.hints.forEach((hint) => console.error(`- ${hint}`));
    process.exitCode = 1;
    return { ok: false, error, issue };
  } finally {
    if (closePool) {
      await db.pool.end().catch(() => {});
    }
  }
}

if (require.main === module) {
  void checkDbConnection();
}

module.exports = {
  checkDbConnection,
};
