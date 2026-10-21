/**
 * The Stats pages (M5, SPEC §11): League Leaders, Player Ratings, Player Stats, Team Stats
 * and Injuries. Season rows come from the cache (current season) or IndexedDB (past ones).
 */
import type {
  InjuriesView,
  LeagueLeadersView,
  PlayerRatingsView,
  PlayerStatsView,
  TeamStatsView,
} from "../../common/api";
import { competitionsConfig } from "../../common/config/competitions";
import { daysBetween, exactAge } from "../../common/dates";
import { RATING_CODES, ratingsConfig } from "../../common/config/ratings";
import type { Club, GameMeta, Player, PlayerStatsRow } from "../../common/schema";
import { isSenior } from "../../common/status";
import type { LeagueSession } from "../league/session";
import { openLeague } from "../league/session";
import { isInjured } from "../season/squads";
import { competitionName, seasonRows, teamRef } from "./common";

const fullName = (p: Player | undefined, pid: number) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : `#${pid}`;

async function playersById(session: LeagueSession, pids: Iterable<number>) {
  const out = new Map<number, Player>();
  for (const pid of new Set(pids)) {
    const p = session.cache.get("players", pid) ?? (await session.db.get("players", pid));
    if (p) out.set(pid, p);
  }
  return out;
}

const clubsOf = (session: LeagueSession) =>
  new Map<number, Club>(session.cache.getAll("clubs").map((c) => [c.cid, c]));

/** The league a club played in that season (its season row), or its current league. */
function leagueOfSeason(session: LeagueSession, cid: number, season: number): string {
  return (
    session.cache.get("clubSeasons", [cid, season])?.leagueId ??
    session.cache.get("clubs", cid)?.leagueId ??
    ""
  );
}

export async function getLeagueLeaders(
  lid: number,
  leagueId: string | null,
  season: number | null,
): Promise<LeagueLeadersView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const s = season ?? game.season;
  const id = leagueId ?? session.cache.get("clubs", game.userCid)?.leagueId ?? "ENG1";
  const league = competitionsConfig.leagues.find((l) => l.id === id);
  const rows = (await seasonRows(session, "playerStats", s)).filter((r) => r.competition === id);
  const players = await playersById(
    session,
    rows.map((r) => r.pid),
  );
  const clubs = clubsOf(session);
  // Average rating needs a share of the games: 40% of the most appearances anyone made.
  const most = Math.max(0, ...rows.map((r) => r.appearances));
  const minApps = Math.max(3, Math.ceil(0.4 * most));
  const top = (
    key: string,
    label: string,
    value: (r: PlayerStatsRow) => number,
    display: (v: number) => string = (v) => String(v),
    filter: (r: PlayerStatsRow) => boolean = () => true,
    note: string | null = null,
  ) => ({
    key,
    label,
    note,
    rows: rows
      .filter((r) => filter(r) && value(r) > 0)
      .sort((a, b) => value(b) - value(a) || a.pid - b.pid)
      .slice(0, 10)
      .map((r) => ({
        pid: r.pid,
        name: fullName(players.get(r.pid), r.pid),
        club: teamRef(clubs.get(r.cid)),
        value: value(r),
        display: display(value(r)),
      })),
  });
  return {
    leagueId: id,
    leagueName: league?.name ?? id,
    season: s,
    categories: [
      top("goals", "Goals", (r) => r.goals),
      top("assists", "Assists", (r) => r.assists),
      top(
        "rating",
        "Average rating",
        (r) => r.ratingTotal / Math.max(1, r.appearances),
        (v) => v.toFixed(2),
        (r) => r.appearances >= minApps,
        `min. ${minApps} appearances`,
      ),
      top(
        "cleanSheets",
        "Clean sheets",
        (r) => r.cleanSheets,
        undefined,
        (r) => players.get(r.pid)?.position === "GK",
      ),
      top(
        "xg",
        "Expected goals",
        (r) => r.xg,
        (v) => v.toFixed(1),
      ),
      top("keyPasses", "Key passes", (r) => r.keyPasses),
      top("tackles", "Tackles", (r) => r.tackles),
      top("yellowCards", "Yellow cards", (r) => r.yellowCards),
    ],
  };
}

export async function getPlayerRatings(lid: number): Promise<PlayerRatingsView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const clubs = clubsOf(session);
  return {
    codes: RATING_CODES.map((code) => ({ code, name: ratingsConfig.ratingNames[code] })),
    rows: session.cache
      .getAll("players")
      .filter((p) => isSenior(p) || p.status === "freeAgent")
      .map((p) => {
        const club = clubs.get(p.cid ?? -1);
        return {
          pid: p.pid,
          name: fullName(p, p.pid),
          nationality: p.nationality,
          club: club ? teamRef(club) : null,
          leagueId: club?.leagueId ?? null,
          status: p.status,
          position: p.position,
          age: Math.floor(exactAge(p.birthDate, game.date)),
          ovr: p.ovr,
          pot: p.pot,
          ratings: (p.ratingsHistory.at(-1)?.ratings ?? []).map((r) => Math.round(r)),
        };
      }),
  };
}

export async function getPlayerStats(
  lid: number,
  season: number | null,
  competition: string | null,
): Promise<PlayerStatsView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const s = season ?? game.season;
  const all = await seasonRows(session, "playerStats", s);
  const competitions = [...new Set(all.map((r) => r.competition))].map((id) => ({
    id,
    name: competitionName(id),
  }));
  const rows = competition ? all.filter((r) => r.competition === competition) : all;
  // One row per player and club (a player who moved has one per club).
  const merged = new Map<string, PlayerStatsRow>();
  for (const r of rows) {
    const key = `${r.pid}/${r.cid}`;
    const m = merged.get(key);
    if (!m) {
      merged.set(key, { ...r });
      continue;
    }
    for (const k of Object.keys(r) as (keyof PlayerStatsRow)[]) {
      const v = r[k];
      if (typeof v === "number" && !["pid", "season", "cid"].includes(k)) {
        (m as Record<string, unknown>)[k] = (m[k] as number) + v;
      }
    }
  }
  const players = await playersById(
    session,
    rows.map((r) => r.pid),
  );
  const clubs = clubsOf(session);
  return {
    season: s,
    competition,
    competitions,
    rows: [...merged.values()]
      .filter((r) => r.appearances > 0)
      .map((r) => {
        const p = players.get(r.pid);
        return {
          pid: r.pid,
          name: fullName(p, r.pid),
          club: teamRef(clubs.get(r.cid)),
          leagueId: leagueOfSeason(session, r.cid, s),
          position: p?.position ?? "",
          age: p ? Math.floor(exactAge(p.birthDate, `${s}-12-31`)) : 0,
          appearances: r.appearances,
          starts: r.starts,
          minutes: r.minutes,
          goals: r.goals,
          assists: r.assists,
          xg: Math.round(r.xg * 10) / 10,
          xa: Math.round(r.xa * 10) / 10,
          shots: r.shots,
          shotsOnTarget: r.shotsOnTarget,
          keyPasses: r.keyPasses,
          passes: r.passes,
          passesCompleted: r.passesCompleted,
          tackles: r.tackles,
          interceptions: r.interceptions,
          yellowCards: r.yellowCards,
          redCards: r.redCards,
          saves: r.saves,
          cleanSheets: r.cleanSheets,
          rating:
            r.appearances > 0 ? Math.round((r.ratingTotal / r.appearances) * 100) / 100 : null,
        };
      }),
  };
}

export async function getTeamStats(
  lid: number,
  leagueId: string | null,
  season: number | null,
): Promise<TeamStatsView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const s = season ?? game.season;
  const id = leagueId ?? session.cache.get("clubs", game.userCid)?.leagueId ?? "ENG1";
  const league = competitionsConfig.leagues.find((l) => l.id === id);
  const clubs = clubsOf(session);
  const fixtures = (await seasonRows(session, "fixtures", s)).filter(
    (f) => f.competition === id && f.result,
  );
  const records = new Map(
    (await seasonRows(session, "matches", s))
      .filter((m) => m.competition === id)
      .map((m) => [m.fid, m]),
  );
  const detailed = fixtures.length > 0 && fixtures.every((f) => records.has(f.fid));
  const cids = [...new Set(fixtures.flatMap((f) => [f.homeCid, f.awayCid]))];
  const rows = cids.map((cid) => {
    const own = fixtures.filter((f) => f.homeCid === cid || f.awayCid === cid);
    const t = {
      goalsFor: 0,
      goalsAgainst: 0,
      xgFor: 0,
      xgAgainst: 0,
      shotsFor: 0,
      shotsAgainst: 0,
      possession: 0,
      passes: 0,
      completed: 0,
      corners: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      cleanSheets: 0,
    };
    for (const f of own) {
      const side = f.homeCid === cid ? 0 : 1;
      const r = f.result;
      if (!r) continue;
      t.goalsFor += side === 0 ? r.homeGoals : r.awayGoals;
      t.goalsAgainst += side === 0 ? r.awayGoals : r.homeGoals;
      if ((side === 0 ? r.awayGoals : r.homeGoals) === 0) t.cleanSheets++;
      const m = records.get(f.fid)?.result;
      if (!m) continue;
      const us = m.teams[side];
      const them = m.teams[side === 0 ? 1 : 0];
      t.xgFor += us.xg;
      t.xgAgainst += them.xg;
      t.shotsFor += us.shots;
      t.shotsAgainst += them.shots;
      t.possession += us.possession;
      t.passes += us.passes;
      t.completed += us.passesCompleted;
      t.corners += us.corners;
      t.fouls += us.fouls;
      t.yellowCards += us.yellowCards;
      t.redCards += us.redCards;
    }
    const n = Math.max(1, own.length);
    const d = <T>(v: T) => (detailed ? v : null);
    return {
      team: teamRef(clubs.get(cid)),
      played: own.length,
      goalsFor: t.goalsFor,
      goalsAgainst: t.goalsAgainst,
      xgFor: d(Math.round(t.xgFor * 10) / 10),
      xgAgainst: d(Math.round(t.xgAgainst * 10) / 10),
      shotsFor: d(t.shotsFor),
      shotsAgainst: d(t.shotsAgainst),
      possession: d(Math.round((t.possession / n) * 1000) / 10),
      passAccuracy: d(Math.round((t.completed / Math.max(1, t.passes)) * 1000) / 10),
      corners: d(t.corners),
      fouls: d(t.fouls),
      yellowCards: d(t.yellowCards),
      redCards: d(t.redCards),
      cleanSheets: t.cleanSheets,
    };
  });
  return { leagueId: id, leagueName: league?.name ?? id, season: s, detailed, rows };
}

export async function getInjuries(lid: number): Promise<InjuriesView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const clubs = clubsOf(session);
  return {
    date: game.date,
    rows: session.cache
      .getAll("players")
      .filter(
        (p) => p.cid !== null && (isSenior(p) || p.status === "academy") && isInjured(p, game.date),
      )
      .map((p) => {
        const club = clubs.get(p.cid ?? -1);
        return {
          pid: p.pid,
          name: fullName(p, p.pid),
          nationality: p.nationality,
          club: teamRef(club),
          leagueId: club?.leagueId ?? "",
          position: p.position,
          ovr: p.ovr,
          type: p.injury?.type ?? "",
          until: p.injury?.until ?? game.date,
          daysLeft: daysBetween(game.date, p.injury?.until ?? game.date),
        };
      })
      .sort((a, b) => b.daysLeft - a.daysLeft || a.pid - b.pid),
  };
}
