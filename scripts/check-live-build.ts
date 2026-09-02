import { execSync } from "node:child_process";
import { loadDotEnv } from "./env-utils";

loadDotEnv();

function commandOutput(command: string) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

const defaultBaseUrl = ["https://crm", "epc-improvements.co.uk"].join(".");
const baseUrl = (process.env.DEPLOY_CHECK_BASE_URL ?? defaultBaseUrl).replace(
  /\/$/,
  "",
);
const expectedCommit =
  process.env.EXPECTED_COMMIT ||
  process.env.APP_BUILD_COMMIT ||
  commandOutput("git rev-parse HEAD");

function flagEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

async function main() {
  const response = await fetch(`${baseUrl}/api/build-version`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    console.error(`FAIL Build-version check returned HTTP ${response.status}.`);
    process.exit(1);
  }

  const payload = (await response.json()) as {
    build?: {
      commit?: string;
      shortCommit?: string;
      branch?: string;
      builtAt?: string;
      runtimeStartedAt?: string;
    };
  };
  const databaseCheckEnabled = flagEnabled(process.env.DEPLOY_CHECK_DATABASE);
  const liveFingerprint =
    payload.build?.commit ?? payload.build?.shortCommit ?? "unknown";
  const liveShortCommit =
    payload.build?.shortCommit ??
    (liveFingerprint === "unknown" ? "unknown" : liveFingerprint.slice(0, 7));
  const expectedShortCommit = expectedCommit.slice(0, 7);

  console.log(`Live URL: ${baseUrl}`);
  console.log(`Expected commit: ${expectedShortCommit}`);
  console.log(`Live commit: ${liveShortCommit}`);
  console.log(`Live built at: ${payload.build?.builtAt ?? "unknown"}`);
  console.log(
    `Runtime started at: ${payload.build?.runtimeStartedAt ?? "unknown"}`,
  );
  console.log(
    `Database check: ${databaseCheckEnabled ? "enabled" : "skipped"}`,
  );

  if (
    liveShortCommit !== expectedShortCommit &&
    !liveFingerprint.startsWith(expectedShortCommit)
  ) {
    console.error("FAIL Live runtime is not serving the expected commit.");
    process.exit(1);
  }

  if (databaseCheckEnabled) {
    const healthResponse = await fetch(`${baseUrl}/api/health?database=1`, {
      headers: { Accept: "application/json" },
    });
    const healthPayload = (await healthResponse.json()) as {
      ok?: boolean;
      database?: string;
    };

    console.log(`Live database health: ${healthPayload.database ?? "unknown"}`);

    if (
      !healthResponse.ok ||
      !healthPayload.ok ||
      healthPayload.database !== "ok"
    ) {
      console.error("FAIL Live database health check did not pass.");
      process.exit(1);
    }
  }

  console.log("PASS Live runtime is serving the expected commit.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
