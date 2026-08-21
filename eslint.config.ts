import { base, typescript } from "@acme-studio/eslint-config";
import { defineConfig } from "eslint/config";

/**
 * Self-lint config for the template, dogfooding the published Acme preset:
 * the `base` stack plus the TypeScript-file overrides.
 *
 * Authored in TypeScript (loaded by jiti) and wrapped in `defineConfig` so the
 * whole config array — including the local override blocks below — is
 * type-checked against the preset's shipped types, rather than only failing
 * when ESLint runs. Generated packages extend this with the opt-in presets they
 * need — e.g. `testing`, `frameworkRouting`, `astro`, `sanity`, `storybook`,
 * `tableComponents` — all re-exported from `@acme-studio/eslint-config`.
 */
export default defineConfig([
  // The vendored agent-skill bundles are mirrored into `.claude/skills/` (already
  // ignored by the preset) and `.agents/skills/` (for Cursor). Neither mirror is
  // part of this repo's lint surface — the bundles are external, zero-dep `.mjs`
  // that own their linting upstream, and CI's directory-scoped lint never touches
  // them. Ignore `.agents/**` too, so the two mirrors are treated symmetrically and
  // a newly-added bundle's Node globals don't trip the change-gated preflight.
  { ignores: [".agents/**"] },
  ...base,
  typescript,
  // Tests and remaining infrastructure/*.mjs helpers legitimately import
  // devDependencies (vitest, node:fs fixtures). Complexity is off for the
  // branchy schema-validator suites under tests/.
  {
    files: ["tests/**/*.{ts,mjs}", "infrastructure/**/*.{ts,mjs}"],
    rules: {
      complexity: "off",
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
  // The published changelog CLI/lib is ported from the zero-dep skill scripts:
  // validate is an inherently branchy flat list of schema checks, and the
  // frontmatter parser / argv scanners use non-null assertions after explicit
  // bounds checks. Complexity + non-null rules don't apply usefully here.
  {
    files: ["src/commands/**/*.ts", "src/lib/**/*.ts", "src/cli.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      complexity: "off",
    },
  },
  // The base preset enables type-aware linting (parserOptions.project: true),
  // which resolves each file to the nearest tsconfig.json. The published build
  // config (tsconfig.json) is deliberately src-only, so tests/ aren't in it.
  // Pin an explicit project that spans src/ + tests/ so type-aware rules
  // resolve every linted file without leaking tests into the dist build.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
