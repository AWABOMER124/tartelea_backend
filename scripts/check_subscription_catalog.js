const db = require('../src/db');
const env = require('../src/config/env');
const SubscriptionService = require('../src/services/subscription.service');
const { describeDbIssue, getDbTarget } = require('../src/utils/dbDiagnostics');

async function checkSubscriptionCatalog({ closePool = true } = {}) {
  console.log('Checking subscription catalog seeding...');
  console.log(`Environment file: ${env.ENV_FILE_PATH}`);
  if (env.ENV_LOCAL_FILE_LOADED) {
    console.log(`Environment override: ${env.ENV_LOCAL_FILE_PATH}`);
  }
  console.log(`Database target: ${getDbTarget(env)}`);

  try {
    const plans = await SubscriptionService.listPlans();
    console.log(`Plans found: ${plans.length}`);

    for (const plan of plans) {
      console.log(`- ${plan.name} (${plan.code}): ${plan.entitlements.join(', ')}`);
    }

    const entitlementsResult = await db.query('SELECT COUNT(*)::int AS total FROM subscription_entitlements');
    const plansResult = await db.query('SELECT COUNT(*)::int AS total FROM subscription_plans');

    console.log(`Total entitlements in DB: ${entitlementsResult.rows[0]?.total ?? 0}`);
    console.log(`Total plans in DB: ${plansResult.rows[0]?.total ?? 0}`);
    return { ok: true };
  } catch (error) {
    const issue = describeDbIssue(error, env);
    console.error('Subscription catalog check failed.');
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
  void checkSubscriptionCatalog();
}

module.exports = {
  checkSubscriptionCatalog,
};
