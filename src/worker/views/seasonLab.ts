/**
 * M3 Season lab (developer-only; the game screens replace it in M5): everything the page
 * shows about the current season, read from the open league's cache.
 */
import type {
  SeasonLabKnockout,
  SeasonLabMatch,
  SeasonLabTableRow,
  SeasonLabTeam,
  SeasonLabView,
  TableZone,
} from "../../common/api";
import { exactAge } from "../../common/dates";
import { competitionsConfig } from "../../common/config/competitions";
import type { Club, Fixture, GameMeta, Player, SeasonMeta } from "../../common/schema";
import { gameState } from "../league/game";
import { openLeague } from "../league/session";
import { PLAYOFF_ROUNDS } from "../schedule/calendar";
import { leagueTable } from "../schedule/standings";
import { playoffId } from "../season/season";
import { isInjured } from "../season/squads";

const team = (club: Club | undefined): SeasonLabTeam => ({
  cid: club?.cid ?? -1,
  name: club?.name ?? "?",
  abbr: club?.abbr ?? "?",
  code: club?.code ?? "",
});

function competitionName(id: string): string {
  const league = competitionsConfig.leagues.find((l) => l.id === id);
  if (league) return league.name;
  const cup = competitionsConfig.cups.find((c) => c.id === id);
  if (cup) return cup.name;
  const po = competitionsConfig.leagues.find((l) => playoffId(l.id) === id);
  return po ? `${po.name} play-offs` : id;
}

function score(f: Fixture): string | null {
  const r = f.result;
  if (!r) return null;
  const base = `${r.homeGoals}–${r.awayGoals}`;
  if (r.penalties) return `${base} aet, ${r.penalties.replace("-", "–")} pens`;
  return r.extraTime ? `${base} aet` : base;
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();

export async function getSeasonLab(lid: number): Promise<SeasonLabView> {
  const session = await openLeague(lid);
  const { cache } = session;
  const game = cache.get("meta", "game") as GameMeta;
  const stored = cache.get("meta", "season") as SeasonMeta;
  const clubs = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  const players = cache.getAll("players");
  const fixtures = cache
    .getAll("fixtures")
    .filter((f) => f.season === game.season)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fid - b.fid));
  const match = (f: Fixture): SeasonLabMatch => ({
    fid: f.fid,
    date: f.date,
    competition: f.competition,
    competitionName: competitionName(f.competition),
    round: f.round,
    leg: f.leg,
    neutral: f.neutral,
    home: team(clubs.get(f.homeCid)),
    away: team(clubs.get(f.awayCid)),
    score: score(f),
    winnerCid: f.result?.winnerCid ?? null,
  });
  const userClub = clubs.get(game.userCid);
  const state = gameState(session);

  const leagues = competitionsConfig.leagues.map((league) => {
    const cids = stored.leagueClubs[league.id] ?? [];
    const rows = leagueTable(
      cids,
      fixtures.filter((f) => f.competition === league.id),
      {
        tieBreakers: league.tieBreakers,
        drawSeed: `${game.seed}/table/${league.id}/${game.season}`,
      },
    );
    const po = league.promotion?.playoffPositions ?? [];
    const zone = (pos: number): TableZone =>
      pos === 1
        ? "champions"
        : league.promotion && pos <= league.promotion.automatic
          ? "promoted"
          : po.includes(pos)
            ? "playoffs"
            : league.relegation && pos > rows.length - league.relegation.places
              ? "relegated"
              : null;
    return {
      id: league.id,
      name: league.name,
      rows: rows.map((r): SeasonLabTableRow => ({
        ...r,
        ...team(clubs.get(r.cid)),
        zone: zone(r.position),
      })),
    };
  });

  const played = fixtures.filter((f) => f.result);
  const lastDate = played.at(-1)?.date ?? null;
  const latest = lastDate
    ? { date: lastDate, matches: played.filter((f) => f.date === lastDate).map(match) }
    : null;

  const knockout = (id: string, name: string, rounds: string[]): SeasonLabKnockout => {
    const ties = fixtures.filter((f) => f.competition === id);
    const final = ties.find((f) => f.round === rounds[rounds.length - 1] && f.result);
    return {
      id,
      name,
      rounds: rounds.map((round) => {
        const matches = ties.filter((f) => f.round === round);
        return { name: round, date: matches[0]?.date ?? null, matches: matches.map(match) };
      }),
      winner: final?.result?.winnerCid != null ? team(clubs.get(final.result.winnerCid)) : null,
    };
  };
  const cups = competitionsConfig.cups.map((c) => knockout(c.id, c.name, c.rounds));
  const playoffs = competitionsConfig.leagues
    .filter((l) => l.promotion && l.promotion.playoffPositions.length > 0)
    .map((l) =>
      knockout(playoffId(l.id), `${l.name} play-offs`, [
        ...(l.promotion?.playoffPositions.length === 6 ? [PLAYOFF_ROUNDS.eliminators] : []),
        PLAYOFF_ROUNDS.semis,
        PLAYOFF_ROUNDS.final,
      ]),
    );

  const injured = players.filter(
    (p) => p.cid !== null && p.status === "club" && isInjured(p, game.date),
  );
  const byClub = new Map<number, number>();
  for (const p of injured) byClub.set(p.cid as number, (byClub.get(p.cid as number) ?? 0) + 1);

  const awards = cache
    .getAll("awards")
    .filter((a) => a.season === game.season)
    .map((a) => ({
      competition: a.competition,
      competitionName: competitionName(a.competition),
      type: a.type,
      name: a.name,
      club: a.pid !== null && a.cid !== null ? (clubs.get(a.cid)?.name ?? "") : "",
    }));

  const transactions = cache
    .getAll("transactions")
    .filter((t) => t.season === game.season)
    .sort((a, b) => b.xid - a.xid);
  const counts: Record<string, number> = {};
  for (const t of transactions) counts[t.type] = (counts[t.type] ?? 0) + 1;

  const academy = players.filter((p) => p.status === "academy");
  const seasonStart = `${game.season}-07-01`;
  const intake = academy.filter(
    (p) =>
      p.ratingsHistory[0]?.date === seasonStart && game.season > competitionsConfig.firstSeason,
  );

  return {
    lid,
    state,
    user: { ...team(userClub), leagueId: userClub?.leagueId ?? "" },
    nextUserMatch: state.nextUserFixture ? match(state.nextUserFixture) : null,
    leagues,
    latest,
    cups,
    playoffs,
    injuries: {
      total: injured.length,
      perSquad: injured.length / Math.max(1, clubs.size),
      user: injured
        .filter((p) => p.cid === game.userCid)
        .map((p) => ({
          name: fullName(p),
          position: p.position,
          type: p.injury?.type ?? "",
          until: p.injury?.until ?? "",
        })),
      mostByClub: [...byClub]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 5)
        .map(([cid, count]) => ({ team: team(clubs.get(cid)), count })),
    },
    awards,
    transactions: {
      counts,
      recent: transactions.slice(0, 12).map((t) => ({
        date: t.date,
        type: t.type,
        text: t.names.join(", "),
      })),
    },
    academy: {
      total: academy.length,
      intakeThisSeason: intake.length,
      topProspects: [...academy]
        .sort((a, b) => b.pot - a.pot || b.ovr - a.ovr)
        .slice(0, 8)
        .map((p) => ({
          name: fullName(p),
          club: clubs.get(p.cid ?? -1)?.name ?? "",
          age: Math.floor(exactAge(p.birthDate, game.date)),
          ovr: p.ovr,
          pot: p.pot,
        })),
    },
  };
}
