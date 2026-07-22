import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The React-Compiler rule flags every `useEffect(() => setState(...), [])` — but that is the
      // officially-recommended, hydration-safe pattern for client-only state that can't be read
      // during SSR (mount flags, localStorage reads, iframe detection, fetch-on-mount). Each fires
      // exactly one intentional post-mount render — not a cascading-render bug. Kept as a WARN so
      // the signal stays visible for any future move to useSyncExternalStore/SWR, without failing
      // CI on a deliberate, safe pattern used throughout the client.
      "react-hooks/set-state-in-effect": "warn",
      // Underscore-prefixed = intentionally unused (a standard convention); a rest-sibling omit
      // (`const { secret, ...rest } = row`) is the idiomatic way to drop a field, not dead code.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  // Tests exercise API shapes with intentionally loose typing; `any` there is not a code smell.
  {
    files: ["tests/**", "**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
