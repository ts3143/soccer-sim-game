/**
 * The Dashboard (M5, SPEC §11): the user's club at a glance. Its position, record and
 * form; the next match and what follows; recent results; the league table; the board;
 * alerts (injuries, tired players, expiring contracts, bids); the season's best
 * performers; the inbox, where bids for the user's players are answered.
 */
import { withPlayerReferences } from "../league/messages";
import type { DashboardView, InboxMessageView } from "../../common/api";
import type { GameMeta, InboxMessage, Offer } from "../../common/schema";
import { contractClub, isSenior } from "../../common/status";
import { effectiveDials } from "../club/standing";
import { openLeague } from "../league/session";
import { yearsLeft } from "../market/market";
import { currentCondition, isInjured } from "../season/squads";
import { formOf, leagueTables, matchView, seasonFixtures, teamRef } from "./common";

/** Players below this condition show as tired. */
const TIRED_BELOW = 75;

/**
 * The bid a message announces: the offer for its player made on its date, by the club it
 * names. Older saves' bid messages name no club: they match only when one offer fits.
 */
function bidOf(m: InboxMessage, offers: readonly Offer[]): InboxMessageView["bid"] {
  const pid = m.players?.[0]?.pid;
  if (pid === undefined || (m.bidFrom === undefined && !m.subject.startsWith("Bid for "))) {
    return undefined;
  }
  const matches = offers.filter(
    (o) =>
      o.pid === pid && o.date === m.date && (m.bidFrom === undefined || o.fromCid === m.bidFrom),
  );
  const offer = matches.length === 1 ? matches[0] : undefined;
  return offer && { oid: offer.oid, status: offer.status };
}

export async function getDashboard(lid: number): Promise<DashboardView> {
  const session = await openLeague(lid);
  const { cache } = session;
  const game = cache.get("meta", "game") as GameMeta;
  const clubs = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  const user = clubs.get(game.userCid);
  if (!user) throw new Error("The save has no user club");
  const fixtures = seasonFixtures(session, game.season);
  const tables = leagueTables(session, fixtures);
  const own = tables.find((t) => t.rows.some((r) => r.cid === user.cid));
  const row = own?.rows.find((r) => r.cid === user.cid);
  const positionOf = (cid: number) =>
    tables.flatMap((t) => t.rows).find((r) => r.cid === cid)?.position ?? null;

  const mine = fixtures.filter((f) => f.homeCid === user.cid || f.awayCid === user.cid);
  const unplayed = mine.filter((f) => !f.result);
  const next = unplayed[0];
  const opponent = next ? (next.homeCid === user.cid ? next.awayCid : next.homeCid) : null;

  const players = cache.getAll("players");
  const medical = effectiveDials(user).medical;
  const squad = players.filter((p) => p.cid === user.cid && isSenior(p));
  const stats = cache
    .getAll("playerStats")
    .filter((r) => r.season === game.season && r.cid === user.cid);
  const perPlayer = new Map<
    number,
    { appearances: number; goals: number; assists: number; ratingTotal: number }
  >();
  for (const r of stats) {
    const t = perPlayer.get(r.pid) ?? { appearances: 0, goals: 0, assists: 0, ratingTotal: 0 };
    t.appearances += r.appearances;
    t.goals += r.goals;
    t.assists += r.assists;
    t.ratingTotal += r.ratingTotal;
    perPlayer.set(r.pid, t);
  }
  const byPid = new Map(players.map((p) => [p.pid, p]));
  const name = (pid: number) => {
    const p = byPid.get(pid);
    return p ? `${p.firstName} ${p.lastName}`.trim() : "?";
  };
  const league = session.config.competitions.leagues.find((l) => l.id === user.leagueId);
  const seasonRow = cache.get("clubSeasons", [user.cid, game.season]);
  const inbox = cache.getAll("inbox").sort((a, b) => b.mid - a.mid);
  const offers = cache.getAll("offers").filter((o) => o.toCid === user.cid);
  return {
    user: { ...teamRef(user), leagueId: user.leagueId, leagueName: league?.name ?? user.leagueId },
    position: row?.position ?? null,
    record: {
      played: row?.played ?? 0,
      won: row?.won ?? 0,
      drawn: row?.drawn ?? 0,
      lost: row?.lost ?? 0,
      points: row?.points ?? 0,
      goalsFor: row?.goalsFor ?? 0,
      goalsAgainst: row?.goalsAgainst ?? 0,
    },
    form: formOf(fixtures, user.cid),
    nextMatch:
      next && opponent !== null
        ? {
            ...matchView(next, clubs, session.config.competitions),
            opponentPosition: positionOf(opponent),
            opponentForm: formOf(fixtures, opponent),
          }
        : null,
    upcoming: unplayed.slice(1, 5).map((f) => matchView(f, clubs, session.config.competitions)),
    recent: mine
      .filter((f) => f.result)
      .slice(-5)
      .reverse()
      .map((f) => matchView(f, clubs, session.config.competitions)),
    table: own?.rows ?? [],
    board: {
      target: league?.board.find((t) => t.id === seasonRow?.boardExpectation)?.label ?? "",
      confidence: seasonRow?.boardConfidence ?? null,
    },
    alerts: {
      injured: squad
        .filter((p) => isInjured(p, game.date))
        .map((p) => ({
          pid: p.pid,
          name: name(p.pid),
          position: p.position,
          type: p.injury?.type ?? "",
          until: p.injury?.until ?? "",
        })),
      tired: squad
        .filter((p) => !isInjured(p, game.date))
        .map((p) => ({ p, condition: currentCondition(p, game.date, medical) }))
        .filter((x) => x.condition < TIRED_BELOW)
        .sort((a, b) => a.condition - b.condition)
        .map(({ p, condition }) => ({
          pid: p.pid,
          name: name(p.pid),
          position: p.position,
          condition: Math.round(condition),
        })),
      expiring: players.filter((p) => contractClub(p) === user.cid && yearsLeft(p, game.date) === 1)
        .length,
      bids: offers.filter((o) => o.status === "open").length,
    },
    topPlayers: [...perPlayer]
      .filter(([, t]) => t.appearances >= 3)
      .sort((a, b) => b[1].ratingTotal / b[1].appearances - a[1].ratingTotal / a[1].appearances)
      .slice(0, 5)
      .map(([pid, t]) => ({
        pid,
        name: name(pid),
        position: byPid.get(pid)?.position ?? "",
        appearances: t.appearances,
        goals: t.goals,
        assists: t.assists,
        rating: Math.round((t.ratingTotal / t.appearances) * 100) / 100,
      })),
    inbox: withPlayerReferences(inbox, players).map((m) => {
      const bid = bidOf(m, offers);
      return bid ? { ...m, bid } : m;
    }),
    unread: inbox.filter((m) => !m.read).length,
    cash: user.cash,
  };
}

/** Marks every inbox message read. */
export async function markAllInboxRead(lid: number): Promise<void> {
  const { cache } = await openLeague(lid);
  for (const m of cache.getAll("inbox")) if (!m.read) cache.put("inbox", { ...m, read: true });
  await cache.flush();
}
