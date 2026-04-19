const { checkDbConnection } = require("./check_db_connection");
const { checkSubscriptionCatalog } = require("./check_subscription_catalog");

async function runDevSanityCheck() {
  const dbResult = await checkDbConnection({ closePool: false });

  if (!dbResult.ok) {
    return;
  }

  await checkSubscriptionCatalog({ closePool: true });
}

if (require.main === module) {
  void runDevSanityCheck();
}
