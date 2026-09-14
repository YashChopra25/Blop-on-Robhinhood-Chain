import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next. Globbed with a leading `**/` so a
    // stray build directory created anywhere in the tree (it happens) cannot
    // silently drag thousands of generated-file errors into the lint result.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Solana test validator state, if a run ever leaves it behind here.
    "**/test-ledger/**",
  ]),
]);

export default eslintConfig;
