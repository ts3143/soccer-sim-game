/**
 * Box score, Game Log and match preview (M5, SPEC §11): a match's saved record (box score,
 * key events, player ratings; other clubs' matches are kept two seasons), a club's season
 * of matches in every competition, and what a watched match's pre-match card shows.
 */
import type { BoxScoreView, ClubMatchView, GameLogView, MatchPreviewView } from "../../common/api";
import type { Club, Fixture, GameMeta } from "../../common/schema";
import { prunedName } from "../league/game";
import { openLeague, type LeagueSession } from "../league/session";
import { byDate, clubMatch, matchView, resultFor, seasonRows, teamRef } from "./common";
import { GameError } from "../../common/errors";

export async function getBoxScore(lid: number, fid: number): Promise<BoxScoreView> {
  const session = await openLeague(lid);
  const { cache, db } = session;
  const fixture = cache.get("fixtures", fid) ?? (await db.get("fixtures", fid));
  if (!fixture) throw new GameError(`There's no match ${fid} in this league.`);
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
  return {
    match: matchView(fixture, clubs, session.config.competitions),
    result: record?.result ?? null,
    players,
  };
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
    .sort(byDate);
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
    return clubMatch(f, cid, clubs, session.config.competitions);
  });
  return { team: teamRef(clubs.get(cid)), season: s, matches, record };
}

const played = (f: Fixture, before: Fixture) => f.result !== null && byDate(f, before) < 0;

/**
 * Before a match: both clubs' last five results this season (fewer early on: last season's
 * don't count, T 2026-10-25), their latest meeting in any season of the save, and a derby
 * when both come from the same city.
 */
export async function getMatchPreview(lid: number, fid: number): Promise<MatchPreviewView> {
  const session = await openLeague(lid);
  const fixture = session.cache.get("fixtures", fid) ?? (await session.db.get("fixtures", fid));
  if (!fixture) throw new GameError(`There's no match ${fid} in this league.`);
  const clubs = new Map<number, Club>(session.cache.getAll("clubs").map((c) => [c.cid, c]));
  const both = (f: Fixture) =>
    (f.homeCid === fixture.homeCid && f.awayCid === fixture.awayCid) ||
    (f.homeCid === fixture.awayCid && f.awayCid === fixture.homeCid);
  const thisSeason = await seasonRows(session, "fixtures", fixture.season);
  const form = (cid: number): ClubMatchView[] =>
    thisSeason
      .filter((f) => (f.homeCid === cid || f.awayCid === cid) && played(f, fixture))
      .sort(byDate)
      .slice(-5)
      .map((f) => clubMatch(f, cid, clubs, session.config.competitions));
  const home = clubs.get(fixture.homeCid);
  const away = clubs.get(fixture.awayCid);
  return {
    fid,
    form: [form(fixture.homeCid), form(fixture.awayCid)],
    lastMeeting: await lastMeeting(session, fixture, both, clubs),
    derby: home && away && home.city === away.city ? home.city : null,
  };
}

/** The latest played meeting before this fixture, searching back season by season. */
async function lastMeeting(
  session: LeagueSession,
  fixture: Fixture,
  both: (f: Fixture) => boolean,
  clubs: ReadonlyMap<number, Club>,
) {
  for (let season = fixture.season; ; season--) {
    const rows = await seasonRows(session, "fixtures", season);
    if (rows.length === 0) return null; // before the save began
    const met = rows
      .filter((f) => both(f) && played(f, fixture))
      .sort(byDate)
      .at(-1);
    if (met) return matchView(met, clubs, session.config.competitions);
  }
}
