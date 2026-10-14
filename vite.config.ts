import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { stripBasedOn } from "./tools/vite/strip-based-on.ts";

export default defineConfig({
  plugins: [stripBasedOn(), react()],
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
