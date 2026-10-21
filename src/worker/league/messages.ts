import { createPlayerMentionSplitter } from "../../common/playerMentions";
import type { InboxMessage, Player } from "../../common/schema";

/** Add safe links to older plain-text messages without rewriting the saved message. */
export function withPlayerReferences<T extends Omit<InboxMessage, "mid">>(
  messages: readonly T[],
  players: readonly Pick<Player, "pid" | "firstName" | "lastName">[],
): T[] {
  let split: ReturnType<typeof createPlayerMentionSplitter> | undefined;
  return messages.map((m) => {
    if (m.players !== undefined) return m;
    if (!["transfer", "contracts", "injury", "injuries"].includes(m.kind)) return m;
    split ??= createPlayerMentionSplitter(
      players.map((p) => ({ pid: p.pid, name: `${p.firstName} ${p.lastName}`.trim() })),
    );
    const matches = split(`${m.subject}\n${m.body}`);
    const seen = new Set<number>();
    const refs = matches.flatMap((part) => {
      if (part.pid === undefined || seen.has(part.pid)) return [];
      seen.add(part.pid);
      return [{ pid: part.pid, name: part.text }];
    });
    return { ...m, players: refs };
  });
}
