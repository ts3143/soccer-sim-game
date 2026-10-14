/**
 * Post-build guard (runs as part of `pnpm build`): fails if the production bundle in
 * dist/ contains the `based_on` field or any real club name it holds (SPEC §6.1).
 * Names that are also a club's city (e.g. "Liverpool") are legitimately in the UI,
 * so only the field name and the other real names are checked.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { realClubNamesToCheck } from "./real-club-names";

const DIST = new URL("../dist/", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const needles = ["based_on", ...realClubNamesToCheck()];
const leaks: string[] = [];
for (const file of files(DIST)) {
  if (!/\.(js|html|css|json|svg|txt|map)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const needle of needles) {
    if (text.includes(needle)) leaks.push(`${file.slice(DIST.length)}: "${needle}"`);
  }
}

if (leaks.length > 0) {
  console.error("Real club data found in the build output:\n  " + leaks.join("\n  "));
  process.exit(1);
}
console.log(`check-bundle: no real club names in dist/ (${needles.length} names checked)`);
