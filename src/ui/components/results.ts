import type { FormResult, MatchView } from "../../common/api";

export const RESULT_LABEL: Record<FormResult, string> = { W: "Win", D: "Draw", L: "Loss" };
export const resultRowClass = (result: FormResult | null): string =>
  result === "W"
    ? "table-success"
    : result === "D"
      ? "table-warning"
      : result === "L"
        ? "table-danger"
        : "";

/** Read the typed result, including shoot-outs, from the club's point of view. */
export function resultForClub(match: MatchView, cid: number): FormResult | null {
  if (match.homeResult === null) return null;
  if (cid === match.home.cid) return match.homeResult;
  if (cid !== match.away.cid) return null;
  return match.homeResult === "W" ? "L" : match.homeResult === "L" ? "W" : "D";
}
