/**
 * Fingerprints of game data, for the tests that hold Classic to a recorded run while the
 * Super League world is built (MILESTONES SL0). A fingerprint is a short hash of a value's
 * JSON (Maps and Sets as lists): a test records them once and fails on any change, naming
 * the part that changed.
 */

/**
 * Hashes `value` as it is now: the JSON is taken before the first await, so the caller
 * may change the value right after the call (the season loop does).
 */
export async function fingerprint(value: unknown): Promise<string> {
  const json = JSON.stringify(value, (_key, v: unknown) =>
    v instanceof Map || v instanceof Set ? [...v] : v,
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** One fingerprint per named part. */
export async function fingerprints(
  parts: Record<string, unknown>,
): Promise<Record<string, string>> {
  const entries = Object.entries(parts).map(
    async ([name, value]) => [name, await fingerprint(value)] as const,
  );
  return Object.fromEntries(await Promise.all(entries));
}
