import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// CLAUDE.md: all randomness in game logic goes through the seeded RNG.
const seededRandomnessOnly = {
  "no-restricted-properties": [
    "error",
    {
      object: "Math",
      property: "random",
      message: "Game randomness must use the seeded RNG (src/worker/core/random.ts).",
    },
  ],
};

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // UI: React in the browser. It reaches the game core only through the typed bridge.
    files: ["src/ui/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/worker", "**/worker/**"],
              message:
                "The UI talks to the game core only via toWorker() in src/ui/workerClient.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/worker/**/*.ts"],
    languageOptions: { globals: globals.worker },
    rules: seededRandomnessOnly,
  },
  {
    files: ["src/common/**/*.ts"],
    rules: seededRandomnessOnly,
  },
  {
    files: ["tools/**/*.ts", "vite.config.ts", "eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tools/**/*.ts"],
    rules: seededRandomnessOnly,
  },
  prettier,
]);
