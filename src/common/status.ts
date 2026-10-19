/**
 * Where a player plays and who holds his contract (SPEC §7.4). A loanee is registered
 * with his loan club (`cid`, status "loan"): he plays, trains and develops there, while
 * his contract, renewals and transfer value stay with his parent club.
 */
import type { Player } from "./schema";

/** A senior playing for his club (`cid`): his own club, or the club he is on loan to. */
export const isSenior = (p: Pick<Player, "status">): boolean =>
  p.status === "club" || p.status === "loan";

/** The club holding his contract: his club, or his parent club while on loan. */
export const contractClub = (p: Pick<Player, "status" | "cid" | "loan">): number | null =>
  p.status === "club" ? p.cid : p.status === "loan" ? (p.loan?.parentCid ?? null) : null;

/** The share of his wage a club pays: all at his club; split by the loan's wage share. */
export function wageShareFor(p: Pick<Player, "status" | "cid" | "loan">, cid: number): number {
  if (p.status === "club") return p.cid === cid ? 1 : 0;
  if (p.status !== "loan" || !p.loan) return 0;
  if (p.cid === cid) return p.loan.wageShare;
  return p.loan.parentCid === cid ? 1 - p.loan.wageShare : 0;
}
