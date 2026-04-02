import { Client } from "pg";

const REQUIRED_ENV = [
  "DATABASE_URL",
  "PAYMENTS_ENABLED",
  "TRIAL_ENABLED",
  "GRANTS_FEATURE_ENABLED",
];

const BOOLEAN_FLAGS = [
  "PAYMENTS_ENABLED",
  "TRIAL_ENABLED",
  "GRANTS_FEATURE_ENABLED",
  "TWOCHECKOUT_FORCE_MOCK",
];

const REQUIRED_PAYMENT_ENV = [
  "TWOCHECKOUT_MERCHANT_CODE",
  "TWOCHECKOUT_SECRET_KEY",
  "TWOCHECKOUT_WEBHOOK_SECRET",
];

let hasErrors = false;

function pass(message) {
  console.log(`PASS  ${message}`);
}

function warn(message) {
  console.log(`WARN  ${message}`);
}

function fail(message) {
  hasErrors = true;
  console.error(`FAIL  ${message}`);
}

function getDbSummary(dbUrl) {
  try {
    const parsed = new URL(dbUrl);
    const protocol = parsed.protocol.replace(":", "");
    const dbName = parsed.pathname.replace(/^\//, "") || "(unknown)";
    return `${protocol}://${parsed.hostname}:${parsed.port || "(default)"}/${dbName}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

async function checkDatabaseConnection() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  const parsed = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail("DATABASE_URL must use postgres/postgresql protocol");
    return;
  }

  const skipDb =
    process.env.LAUNCH_CHECK_SKIP_DB === "true" ||
    process.argv.includes("--skip-db");

  if (skipDb) {
    warn("Skipping DB connection test (LAUNCH_CHECK_SKIP_DB=true or --skip-db)");
    return;
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query("select 1 as ok");
    pass(`Database reachable (${getDbSummary(connectionString)})`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown DB connection error";
    fail(`Database connection failed: ${message}`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  console.log("Running WOWSTER launch checks...");
  const strict =
    process.argv.includes("--strict") ||
    process.env.LAUNCH_CHECK_STRICT === "true";

  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      fail(`Missing required env: ${key}`);
    } else {
      pass(`Env present: ${key}`);
    }
  }

  for (const key of BOOLEAN_FLAGS) {
    const value = process.env[key];
    if (!value) continue;
    if (!["true", "false"].includes(value)) {
      fail(`${key} must be \"true\" or \"false\"`);
    }
  }

  if (process.env.PAYMENTS_ENABLED === "true") {
    warn("PAYMENTS_ENABLED=true (ensure real 2Checkout webhook/signature setup is complete)");
    if (process.env.TWOCHECKOUT_FORCE_MOCK === "true") {
      warn("TWOCHECKOUT_FORCE_MOCK=true (payment URLs are mock redirects)");
    }
    if (strict) {
      for (const key of REQUIRED_PAYMENT_ENV) {
        if (!process.env[key]) {
          fail(`Missing required 2Checkout env in strict mode: ${key}`);
        } else {
          pass(`2Checkout env present: ${key}`);
        }
      }
    }
  }

  await checkDatabaseConnection();

  if (hasErrors) {
    console.error("\nLaunch checks failed.");
    process.exit(1);
  }

  console.log("\nLaunch checks passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
