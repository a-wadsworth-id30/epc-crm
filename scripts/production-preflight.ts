import { loadDotEnv, validateProductionEnv } from "./env-utils";

loadDotEnv();

const result = validateProductionEnv();
const baseUrl = process.env.APP_BASE_URL ?? "{APP_BASE_URL}";

console.log("CRM production preflight");
console.log("========================");
console.log(`Base URL: ${baseUrl}`);
console.log(`Runtime database: ${result.database.runtime.label}`);
console.log(`Migration database: ${result.database.migration.label}`);
console.log(`Healthcheck: ${baseUrl}/api/health`);
console.log(`Twilio voice webhook: ${baseUrl}/api/webhooks/twilio/voice`);
console.log(
  `Twilio voice status callback: ${baseUrl}/api/webhooks/twilio/voice/status`,
);
console.log(
  `Twilio conference callback: ${baseUrl}/api/webhooks/twilio/voice/conference`,
);
console.log(
  `Twilio queue callback: ${baseUrl}/api/webhooks/twilio/voice/queue`,
);
console.log(
  `Twilio recording callback: ${baseUrl}/api/webhooks/twilio/voice/recording`,
);
console.log("");

for (const warning of result.warnings) {
  console.warn(`WARN ${warning}`);
}

if (result.missing.length) {
  console.error(
    `FAIL Missing required environment variables: ${result.missing.join(", ")}`,
  );
}

if (result.invalid.length) {
  console.error(
    `FAIL Invalid required environment variables: ${result.invalid.join(", ")}`,
  );
}

if (!result.ok) {
  process.exit(1);
}

console.log("PASS Environment preflight passed.");
