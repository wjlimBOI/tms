import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next. `next lint` used to
  // respect .gitignore automatically; plain `eslint .` (the CLI's own
  // `lint` command was removed in this Next.js version) does not, so the
  // generated-file patterns from .gitignore are mirrored here explicitly.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client output (see .gitignore):
    "src/lib/generated/**",
    "prisma/generated/**",
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
