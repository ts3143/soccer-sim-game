import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { stripBasedOn } from "./tools/vite/strip-based-on.ts";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

export default defineConfig({
  plugins: [stripBasedOn(), react()],
  // The release shown in the app (Manage Leagues, Settings).
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: {
    // The game core runs as a module worker (SharedWorker, or Worker as fallback).
    format: "es",
    // Worker bundles have their own plugin pipeline; the club data is loaded there.
    plugins: () => [stripBasedOn()],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
  },
});
