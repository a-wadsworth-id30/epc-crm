import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    allowCypressEnv: false,
    baseUrl: "http://localhost:3001",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: false,
  },
});
