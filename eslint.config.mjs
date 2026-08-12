import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "desktop/softphone/**",
      "next-env.d.ts",
      "src/app/(admin)/(home)/**",
      "src/app/(admin)/(ui-elements)/**",
      "src/app/(admin)/(ecommerce)/**",
      "src/app/(admin)/(others-pages)/(chart)/**",
      "src/app/(layouts-example)/**",
      "src/components/ai*/**",
      "src/components/analytics/**",
      "src/components/calendar/**",
      "src/components/charts/**",
      "src/components/ecommerce/**",
      "src/components/example*/**",
      "src/components/finance-dashboard/**",
      "src/components/maps/**",
      "src/components/sales/**",
      "src/components/task/**",
      "src/components/ui/popover/**",
      "src/components/ui/tooltip/**",
      "src/components/user-profile/**",
      "src/context/**"
    ]
  }
]);

export default eslintConfig;
