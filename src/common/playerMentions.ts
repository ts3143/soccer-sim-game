import type { InboxMessage } from "./schema";
export type PlayerReference = NonNullable<InboxMessage["players"]>[number];
export interface MentionPart {
  text: string;
  pid?: number;
}

/** Exact, Unicode-aware name matching; ambiguous names stay plain text. No HTML parsing. */
export function createPlayerMentionSplitter(players: readonly PlayerReference[]) {
  const names = new Map<string, number | null>();
  for (const p of players) {
    if (!p.name) continue;
    const before = names.get(p.name);
    names.set(p.name, before === undefined || before === p.pid ? p.pid : null);
  }
  const alternatives = [...names]
    .filter(([, pid]) => pid !== null)
    .map(([name]) => name)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = alternatives.length
    ? new RegExp(
        `(?<![\\p{L}\\p{M}\\p{N}'’\\-])(?:${alternatives.join("|")})(?![\\p{L}\\p{M}\\p{N}'’\\-])`,
        "gu",
      )
    : null;
  return (text: string): MentionPart[] => {
    if (!pattern) return [{ text }];
    const parts: MentionPart[] = [];
    let at = 0;
    for (const match of text.matchAll(pattern)) {
      const index = match.index;
      if (index > at) parts.push({ text: text.slice(at, index) });
      parts.push({ text: match[0], pid: names.get(match[0])! });
      at = index + match[0].length;
    }
    if (at < text.length || !parts.length) parts.push({ text: text.slice(at) });
    return parts;
  };
}
