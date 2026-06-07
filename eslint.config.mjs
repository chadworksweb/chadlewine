import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Sitewide guard against JSX silently dropping the space around inline
    // elements (bold, italic, links) when the adjacent text wraps to a new
    // line -- e.g. `<strong>x</strong>\n word` renders as `xword`. Forces an
    // explicit {" "} at the boundary. This is what produced the bold/italic
    // run-together bugs; the rule stops them recurring anywhere in the app.
    rules: {
      "react/jsx-child-element-spacing": "warn",
    },
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
