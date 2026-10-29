/**
 * History, Team History, Transactions, Power Rankings and the Finances overview (M5,
 * SPEC §10.5, §11). Honours come from the award rows (name snapshots), seasons from the
 * club-season rows, logs from transactions; past seasons are read from IndexedDB.
 */
import type {
  FinancesView,
  HistoryView,
  PowerRankingsView,
  TeamHistoryView,
  TransactionsView,
} from "../../common/api";
import type { AwardRow, Club, GameMeta } from "../../common/schema";
import { transferBanned } from "../finance/ffp";
import { clubCap, payroll } from "../finance/softCap";
import { operatingRevenue, owedAmortisation, owedWages, totalOf } from "../finance/finance";
import { clubStrength } from "../club/standing";
import type { LeagueSession } from "../league/session";
import { openLeague } from "../league/session";
import { squadCost } from "../market/transfers";
import { playoffId } from "../season/season";
import {
  allAwards,
  describeTransaction,
  formOf,
  leagueTables,
  seasonFixtures,
  seasonRows,
  teamRef,
} from "./common";
import { GameError } from "../../common/errors";

const clubsOf = (session: LeagueSession) =>
  new Map<number, Club>(session.cache.getAll("clubs").map((c) => [c.cid, c]));

export async function getHistory(lid: number): Promise<HistoryView> {
  const session = await openLeague(lid);
  const awards = await allAwards(session);
  const clubs = clubsOf(session);
  const ref = (a: AwardRow | undefined) => (a?.cid != null ? teamRef(clubs.get(a.cid)) : null);
  const seasons = [...new Set(awards.map((a) => a.season))].sort((a, b) => b - a);
  const out: HistoryView["seasons"] = [];
  for (const season of seasons) {
    const own = awards.filter((a) => a.season === season);
    const find = (type: string, competition: string) =>
      own.find((a) => a.type === type && a.competition === competition);
    const leagues = [];
    // The award winner's season row in that league (null once he's pruned).
    const statsOf = async (a: AwardRow | undefined, league: string) => {
      if (a?.pid == null || a.cid == null) return null;
      const key: [number, number, number, string] = [a.pid, season, a.cid, league];
      return (
        session.cache.get("playerStats", key) ?? (await session.db.get("playerStats", key)) ?? null
      );
    };
    for (const league of session.config.competitions.leagues) {
      const boot = find("goldenBoot", league.id);
      const goals = (await statsOf(boot, league.id))?.goals ?? null;
      const provider = find("topAssists", league.id);
      const assists = (await statsOf(provider, league.id))?.assists ?? null;
      const poty = find("playerOfTheYear", league.id);
      leagues.push({
        id: league.id,
        name: league.name,
        champion: ref(find("champions", league.id)),
        tableWinner: ref(find("tableWinner", league.id)),
        promoted: own
          .filter((a) => a.type === "promoted" && a.competition === league.id)
          .map((a) => teamRef(clubs.get(a.cid ?? -1))),
        playoffWinner: ref(find("playoffWinner", playoffId(league.id))),
        relegated: own
          .filter((a) => a.type === "relegated" && a.competition === league.id)
          .map((a) => teamRef(clubs.get(a.cid ?? -1))),
        playerOfTheYear: poty ? { pid: poty.pid, name: poty.name, club: ref(poty) } : null,
        goldenBoot: boot ? { pid: boot.pid, name: boot.name, club: ref(boot), goals } : null,
        topAssists: provider
          ? { pid: provider.pid, name: provider.name, club: ref(provider), assists }
          : null,
      });
    }
    out.push({
      season,
      leagues,
      cups: session.config.competitions.cups.map((c) => ({
        id: c.id,
        name: c.name,
        winner: ref(find("cupWinner", c.id)),
      })),
    });
  }
  return { seasons: out };
}

export async function getTeamHistory(lid: number, cid: number): Promise<TeamHistoryView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const club = session.cache.get("clubs", cid);
  if (!club) throw new GameError(`There's no club ${cid} in this league.`);
  const awards = (await allAwards(session)).filter((a) => a.cid === cid);
  const leagueName = (id: string) =>
    session.config.competitions.leagues.find((l) => l.id === id)?.name ?? id;
  const cupName = (id: string) =>
    session.config.competitions.cups.find((c) => c.id === id)?.name ?? id;
  const honourOf = (a: AwardRow): string | null => {
    switch (a.type) {
      case "champions":
        return `${leagueName(a.competition)} champions`;
      case "cupWinner":
        return `${cupName(a.competition)} winners`;
      case "playoffWinner":
        return `${leagueName(a.competition.replace(/-PO$/, ""))} play-off winners`;
      case "tableWinner":
        return `Top of the ${leagueName(a.competition)} table`;
      case "promoted":
        return `Promoted from the ${leagueName(a.competition)}`;
      case "relegated":
        return `Relegated from the ${leagueName(a.competition)}`;
      default:
        return null;
    }
  };
  const rows = session.cache
    .getAll("clubSeasons")
    .filter((r) => r.cid === cid)
    .sort((a, b) => b.season - a.season);
  const seasons: TeamHistoryView["seasons"] = [];
  for (const r of rows) {
    const stats = (await seasonRows(session, "playerStats", r.season)).filter(
      (s) => s.cid === cid && s.competition === r.leagueId,
    );
    const best = [...stats].sort((a, b) => b.goals - a.goals || a.pid - b.pid)[0];
    let topScorer: TeamHistoryView["seasons"][number]["topScorer"] = null;
    if (best && best.goals > 0) {
      const p =
        session.cache.get("players", best.pid) ?? (await session.db.get("players", best.pid));
      topScorer = {
        pid: best.pid,
        name: p ? `${p.firstName} ${p.lastName}`.trim() : `#${best.pid}`,
        goals: best.goals,
      };
    }
    seasons.push({
      season: r.season,
      leagueId: r.leagueId,
      leagueName: leagueName(r.leagueId),
      finish: r.finish,
      played: r.won + r.drawn + r.lost,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      points: r.points,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      honours: awards
        .filter((a) => a.season === r.season)
        .map(honourOf)
        .filter((h): h is string => h !== null),
      topScorer,
      current: r.season === game.season,
    });
  }
  const tally = new Map<string, number[]>();
  for (const a of awards) {
    const label = honourOf(a);
    if (!label || a.type === "relegated") continue;
    tally.set(label, [...(tally.get(label) ?? []), a.season]);
  }
  return {
    team: teamRef(club),
    seasons,
    honours: [...tally].map(([label, s]) => ({ label, seasons: s.sort((a, b) => a - b) })),
  };
}

export async function getTransactions(
  lid: number,
  season: number | null,
): Promise<TransactionsView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const s = season ?? game.season;
  return {
    season: s,
    rows: (await seasonRows(session, "transactions", s))
      .sort((a, b) => b.xid - a.xid)
      .map((t) => ({
        xid: t.xid,
        date: t.date,
        type: t.type,
        text: describeTransaction(t),
        fee: t.fee,
        cids: t.cids,
      })),
  };
}

export async function getPowerRankings(lid: number): Promise<PowerRankingsView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const players = session.cache.getAll("players");
  const fixtures = seasonFixtures(session, game.season);
  const tables = leagueTables(session, fixtures);
  const rowOf = (cid: number) => tables.flatMap((t) => t.rows).find((r) => r.cid === cid);
  // Full strength: the same squads with nobody injured.
  const healthy = players.map((p) => (p.injury ? { ...p, injury: null } : p));
  return {
    rows: session.cache
      .getAll("clubs")
      .map((club) => {
        const strength = clubStrength(players, club.cid, game.date);
        const row = rowOf(club.cid);
        const gdPerGame = row && row.played > 0 ? row.goalDifference / row.played : 0;
        const league = fixtures.filter((f) => f.competition === club.leagueId);
        return {
          team: teamRef(club),
          leagueId: club.leagueId,
          strength: Math.round(strength * 10) / 10,
          fullStrength: Math.round(clubStrength(healthy, club.cid, game.date) * 10) / 10,
          form: formOf(league, club.cid),
          goalDifferencePerGame: Math.round(gdPerGame * 100) / 100,
          position: row?.position ?? null,
          score: Math.round((strength + 3 * Math.max(-2, Math.min(2, gdPerGame))) * 10) / 10,
        };
      })
      .sort((a, b) => b.score - a.score || a.team.cid - b.team.cid),
  };
}

export async function getFinances(lid: number, season: number | null): Promise<FinancesView> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  const s = season ?? game.season;
  const current = s === game.season;
  const clubs = clubsOf(session);
  const players = session.cache.getAll("players");
  const competitions = session.config.competitions;
  const softCap = competitions.softCap;
  return {
    season: s,
    current,
    rows: session.cache
      .getAll("clubSeasons")
      .filter((r) => r.season === s)
      .map((r) => {
        const club = clubs.get(r.cid);
        const revenue = operatingRevenue(r.revenue) + (r.revenue.playerSales ?? 0);
        const expenses = totalOf(r.expenses);
        const base = r.budgetBase ?? club?.revenueAnchor ?? 1;
        return {
          team: teamRef(club),
          leagueId: r.leagueId,
          revenue,
          expenses,
          profit: revenue - expenses,
          cash: current ? (club?.cash ?? 0) : (r.cashEnd ?? 0),
          // Released players' wages and fees still count (SPEC §7.6).
          wages: current
            ? Math.round(squadCost(players, r.cid).wages + (club ? owedWages(club) : 0))
            : null,
          squadCostRatio: current
            ? Math.round(
                ((squadCost(players, r.cid).total +
                  (club ? owedWages(club) + owedAmortisation(club) : 0)) /
                  Math.max(1, base)) *
                  1000,
              ) / 1000
            : r.squadCostRatio,
          payroll: current && club && softCap ? payroll(club, players, game.date) : null,
          cap: current && club ? clubCap(competitions, club, s) : null,
          taxPaid: !current && softCap ? Math.round(r.expenses.luxuryTax ?? 0) : null,
          taxReceived: !current && softCap ? Math.round(r.revenue.taxShare ?? 0) : null,
          ffp:
            current && club && !softCap
              ? transferBanned(club, game.date)
                ? "banned"
                : club.ffp?.warned
                  ? "warned"
                  : "ok"
              : null,
          reputation: Math.round(r.reputation),
        };
      }),
  };
}
