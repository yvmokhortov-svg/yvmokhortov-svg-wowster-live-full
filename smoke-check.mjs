const baseUrl = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const shouldPrintReport =
  process.argv.includes("--report") || process.env.SMOKE_REPORT === "true";

let hasErrors = false;
const results = [];

function pass(message) {
  console.log(`PASS  ${message}`);
}

function fail(message) {
  hasErrors = true;
  console.error(`FAIL  ${message}`);
}

function addResult(name, ok, detail) {
  results.push({
    name,
    ok,
    detail,
  });
}

async function checkJson(name, path, expectedStatus, validator) {
  try {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => null);

    if (res.status !== expectedStatus) {
      const detail = `expected status ${expectedStatus}, got ${res.status}`;
      fail(`${name}: ${detail}`);
      addResult(name, false, detail);
      return;
    }

    const validationError = validator?.(data);
    if (validationError) {
      fail(`${name}: ${validationError}`);
      addResult(name, false, validationError);
      return;
    }

    const detail = `status ${expectedStatus}`;
    pass(`${name}: ${detail}`);
    addResult(name, true, detail);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unexpected request failure";
    fail(`${name}: ${detail}`);
    addResult(name, false, detail);
  }
}

async function checkHtml(name, path, expectedStatus, containsText) {
  try {
    const url = `${baseUrl}${path}`;
    const res = await fetch(url);
    const text = await res.text();

    if (res.status !== expectedStatus) {
      const detail = `expected status ${expectedStatus}, got ${res.status}`;
      fail(`${name}: ${detail}`);
      addResult(name, false, detail);
      return;
    }

    if (containsText && !text.includes(containsText)) {
      const detail = `expected response to include "${containsText}"`;
      fail(`${name}: ${detail}`);
      addResult(name, false, detail);
      return;
    }

    const detail = `status ${expectedStatus}`;
    pass(`${name}: ${detail}`);
    addResult(name, true, detail);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unexpected request failure";
    fail(`${name}: ${detail}`);
    addResult(name, false, detail);
  }
}

function printReport() {
  if (!results.length) return;

  const header = ["Check", "Result", "Detail"];
  const nameWidth = Math.max(header[0].length, ...results.map((r) => r.name.length));
  const resultWidth = Math.max(header[1].length, ...results.map(() => 4));
  const detailWidth = Math.max(
    header[2].length,
    ...results.map((r) => r.detail.length),
  );

  const divider =
    `${"-".repeat(nameWidth)}-+-${"-".repeat(resultWidth)}-+-${"-".repeat(detailWidth)}`;

  console.log("\nSmoke check report");
  console.log(
    `${header[0].padEnd(nameWidth)} | ${header[1].padEnd(resultWidth)} | ${header[2].padEnd(detailWidth)}`,
  );
  console.log(divider);
  for (const row of results) {
    const resultLabel = row.ok ? "PASS" : "FAIL";
    console.log(
      `${row.name.padEnd(nameWidth)} | ${resultLabel.padEnd(resultWidth)} | ${row.detail.padEnd(detailWidth)}`,
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${results.length} total`);
}

async function main() {
  console.log(`Running smoke checks against ${baseUrl}`);

  await checkJson("Health endpoint", "/api/health", 200, (data) => {
    if (!data || data.ok !== true) return "ok=true not returned";
    if (data.db !== "ok") return "db=ok not returned";
    return null;
  });

  await checkJson("Anonymous access state", "/api/access/me", 200, (data) => {
    if (!data) return "missing JSON body";
    if (data.user !== null) return "expected anonymous user=null";
    return null;
  });

  await checkJson("Admin endpoint auth guard", "/api/admin/houses", 403, (data) => {
    if (!data || data.error !== "Forbidden") return "expected Forbidden error";
    return null;
  });

  const paymentsResponse = await fetch(`${baseUrl}/api/payments/create-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "subscription",
      tier_cents: 2500,
      house_name: "House of Picassos",
      level: 1,
      class_day: "Monday",
      class_time: "17:00",
      teacher_nickname: "Mia Hart",
    }),
  });
  const paymentsJson = await paymentsResponse.json().catch(() => null);
  if (paymentsResponse.status !== 401) {
    const detail = `expected status 401, got ${paymentsResponse.status}`;
    fail(
      `Payments endpoint auth guard: ${detail}`,
    );
    addResult("Payments endpoint auth guard", false, detail);
  } else if (!paymentsJson || paymentsJson.error !== "Unauthorized") {
    const detail = "expected Unauthorized error payload";
    fail(`Payments endpoint auth guard: ${detail}`);
    addResult("Payments endpoint auth guard", false, detail);
  } else {
    const detail = "status 401";
    pass(`Payments endpoint auth guard: ${detail}`);
    addResult("Payments endpoint auth guard", true, detail);
  }

  await checkHtml("Schedules page", "/schedules", 200, "Schedules");
  await checkHtml("Live shows page", "/live-shows-now", 200, "Live Shows Now");

  if (shouldPrintReport) {
    printReport();
  }

  if (hasErrors) {
    console.error("\nSmoke checks failed.");
    process.exit(1);
  }

  console.log("\nSmoke checks passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
