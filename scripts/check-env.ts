import { loadDotEnv, validateProductionEnv } from "./env-utils";

loadDotEnv();

const result = validateProductionEnv();

console.log(`Runtime database: ${result.database.runtime.label}`);
console.log(`Migration database: ${result.database.migration.label}`);

for (const warning of result.warnings) {
  console.warn(`WARN ${warning}`);
}

if (result.missing.length) {
  console.error(
    `Missing required environment variables: ${result.missing.join(", ")}`,
  );
}

if (result.invalid.length) {
  console.error(
    `Invalid required environment variables: ${result.invalid.join(", ")}`,
  );
}

if (!result.ok) {
  process.exit(1);
}

console.log("Environment check passed.");
