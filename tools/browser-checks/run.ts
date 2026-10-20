/**
 * `pnpm browsercheck [m5 m6 sweep career edges perf] [--base URL]`: headless Chrome checks of the game UI
 * against a running production build (`pnpm build && pnpm preview`). Each check is a script
 * in this folder; with no names, all of them run. Needs Google Chrome installed (the
 * checks drive it through playwright-core; no browser download).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realClubNamesToCheck } from "../real-club-names";

const CHECKS = ["m5", "m6", "sweep", "career", "edges", "perf"];
const args = process.argv.slice(2);
let base = "http://localhost:4173";
const names: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") base = args[++i] ?? base;
  else names.push(args[i] ?? "");
}
const chosen = names.length > 0 ? names : CHECKS;
const unknown = chosen.filter((n) => !CHECKS.includes(n));
if (unknown.length > 0) {
  console.error(`Unknown check(s): ${unknown.join(", ")}. Choose from ${CHECKS.join(", ")}.`);
  process.exit(2);
}

try {
  await fetch(base);
} catch {
  console.error(`Nothing is serving ${base}. Run \`pnpm build && pnpm preview\` first.`);
  process.exit(2);
}

// What the pages must never show: real club names (SPEC §6.1).
const scratch = mkdtempSync(join(tmpdir(), "browser-checks-"));
const expected = join(scratch, "expected.json");
writeFileSync(expected, JSON.stringify({ realNames: realClubNamesToCheck().names }));

const failed: string[] = [];
for (const name of chosen) {
  console.log(`\n=== ${name} ===`);
  const run = spawnSync(process.execPath, [new URL(`./${name}.mjs`, import.meta.url).pathname], {
    stdio: "inherit",
    env: { ...process.env, BASE: base, EXPECTED: expected, SCRATCH: scratch },
  });
  if (run.status !== 0) failed.push(name);
}
rmSync(scratch, { recursive: true, force: true });
console.log(
  failed.length === 0
    ? `\nAll browser checks pass (${chosen.join(", ")}).`
    : `\nFailed: ${failed.join(", ")}.`,
);
process.exit(failed.length === 0 ? 0 : 1);
