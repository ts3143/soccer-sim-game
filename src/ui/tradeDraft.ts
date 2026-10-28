/**
 * The trade the user is putting together on the Trade page, kept per league in this tab
 * (sessionStorage), so it survives a reload or a look at another page. The Trading Block,
 * an inbox offer and a player's "Trade for" load theirs into it. Storage can fail (private
 * windows): the trade then lasts as long as the page.
 */
import type { TradeAssets, TradeProposal } from "../common/api";

const memory = new Map<number, TradeProposal>();
const keyOf = (lid: number) => `trade/${lid}`;

export const noAssets = (): TradeAssets => ({ pids: [], picks: [] });

export function loadTrade(lid: number): TradeProposal | null {
  try {
    const saved = sessionStorage.getItem(keyOf(lid));
    if (saved) return JSON.parse(saved) as TradeProposal;
  } catch {
    // Fall back to this page's memory.
  }
  return memory.get(lid) ?? null;
}

export function saveTrade(lid: number, proposal: TradeProposal): void {
  memory.set(lid, proposal);
  try {
    sessionStorage.setItem(keyOf(lid), JSON.stringify(proposal));
  } catch {
    // Kept in memory only.
  }
}
