/**
 * Box score and Game Log (M5, SPEC §11): a match's saved record (box score, key events,
 * player ratings; other clubs' matches are kept two seasons) and a club's season of
 * matches in every competition.
 */
import type { BoxScoreView, GameLogView } from "../../common/api";
import type { Club, Fixture, GameMeta } from "../../common/schema";
import { prunedName } from "../league/game";
import { openLeague } from "../league/session";
import { matchView, resultFor, seasonRows, teamRef } from "./common";

export async function getBoxScore(lid: number, fid: number): Promise<BoxScoreView> {
  const session = await openLeague(lid);
  const { cache, db } = session;
  const fixture = cache.get("fixtures", fid) ?? (await db.get("fixtures", fid));
  if (!fixture) throw new Error(`No match ${fid}`);
  const record = cache.get("matches", fid) ?? (await db.get("matches", fid));
  const clubs = new Map<number, Club>(cache.getAll("clubs").map((c) => [c.cid, c]));
  const players: BoxScoreView["players"] = {};
  for (const s of record?.result.players ?? []) {
    const p = cache.get("players", s.pid) ?? (await db.get("players", s.pid));
    players[s.pid] = {
      name: p
        ? `${p.firstName} ${p.lastName}`.trim()
        : (prunedName(session, s.pid)?.name ?? `#${s.pid}`),
      shirtNumber: p?.shirtNumber ?? null,
    };
  }
  return { match: matchView(fixture, clubs), result: record?.result ?? null, players };
}

export async function getGameLog(
  lid: number,
  cid: number,
  season: number | null,
): Promise<GameLogView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const s = season ?? game.season;
  const clubs = new Map<number, Club>(session.cache.getAll("clubs").map((c) => [c.cid, c]));
  const own = (await seasonRows(session, "fixtures", s))
    .filter((f: Fixture) => f.homeCid === cid || f.awayCid === cid)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fid - b.fid));
  const record = { won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
  const matches = own.map((f) => {
    const home = f.homeCid === cid;
    const result = resultFor(f, cid);
    if (f.result) {
      record.goalsFor += home ? f.result.homeGoals : f.result.awayGoals;
      record.goalsAgainst += home ? f.result.awayGoals : f.result.homeGoals;
      if (result === "W") record.won++;
      else if (result === "D") record.drawn++;
      else record.lost++;
    }
    return {
      match: matchView(f, clubs),
      venue: f.neutral ? ("N" as const) : home ? ("H" as const) : ("A" as const),
      opponent: teamRef(clubs.get(home ? f.awayCid : f.homeCid)),
      result,
    };
  });
  return { team: teamRef(clubs.get(cid)), season: s, matches, record };
}
