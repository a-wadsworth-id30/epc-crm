import { loadDotEnv, validateProductionEnv } from "./env-utils";

loadDotEnv();

const result = validateProductionEnv();

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
