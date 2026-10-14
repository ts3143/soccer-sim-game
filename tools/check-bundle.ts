/**
 * Post-build guard (runs as part of `pnpm build`): fails if the production bundle in
 * dist/ contains the `based_on` field or any real club name it holds (SPEC §6.1).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BASED_ON_FIELD, realClubNamesToCheck } from "./real-club-names";

const DIST = new URL("../dist/", import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const { names, skipped } = realClubNamesToCheck();
const leaks: string[] = [];
for (const file of files(DIST)) {
  if (!/\.(js|html|css|json|svg|txt|map)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  const where = file.slice(DIST.length);
  if (BASED_ON_FIELD.test(text)) leaks.push(`${where}: the based_on field`);
  for (const name of names) if (text.includes(name)) leaks.push(`${where}: "${name}"`);
}

if (leaks.length > 0) {
  console.error("Real club data found in the build output:\n  " + leaks.join("\n  "));
  process.exit(1);
}
console.log(
  `check-bundle: no based_on field and none of ${names.length} real club names in dist/` +
    (skipped.length > 0 ? ` (skipped, also cities or people's names: ${skipped.join(", ")})` : ""),
);
