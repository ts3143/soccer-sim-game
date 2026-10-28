/**
 * The draft (SPEC §17.5): this season's (its lottery pool, order, the picks made and to
 * come, the prospects left), the drafts held, the classes to come; and a club's picks.
 */
import type {
  DraftLotteryRow,
  DraftPickRow,
  DraftPicksView,
  DraftProspectView,
  DraftSlotView,
  DraftView,
} from "../../common/api";
import { exactAge } from "../../common/dates";
import { GameError } from "../../common/errors";
import type { DraftPick, GameMeta, Player } from "../../common/schema";
import type { LeagueSession } from "../league/session";
import { projectedSlots } from "../market/tradeValue";
import { seasonDate } from "../schedule/calendar";
import { fullName } from "../season/offseason";
import { availableProspects, nextPick } from "../season/draft";
import { playedTables, seasonFixtures, teamRef } from "./common";

const noDraft = () => new GameError("There's no draft in this world.");

export function draftView(session: LeagueSession, season: number | null = null): DraftView {
  const { cache, config } = session;
  const draft = config.competitions.draft;
  if (!draft) throw noDraft();
  const game = cache.get("meta", "game") as GameMeta;
  const s = season ?? game.season;
  const clubs = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  const players = cache.getAll("players");
  const seasons = [
    ...new Set([
      game.season,
      ...players.flatMap((p) =>
        p.draft
          ? [p.draft.season]
          : p.status === "prospect" && p.draftSeason !== undefined
            ? [p.draftSeason]
            : [],
      ),
    ]),
  ].sort((a, b) => a - b);
  if (!seasons.includes(s)) throw new GameError(`There's no ${s + 1} draft to show.`);
  const prospect = (p: Player): DraftProspectView => ({
    pid: p.pid,
    name: fullName(p),
    position: p.position,
    age: Math.floor(exactAge(p.birthDate, game.date)),
    ovr: p.ovr,
    pot: p.pot,
    nationality: p.nationality,
  });
  const from = (cid: number, originalCid: number | undefined) =>
    originalCid === undefined || originalCid === cid ? null : teamRef(clubs.get(originalCid));
  const made: DraftSlotView[] = players
    .filter((p) => p.draft?.season === s)
    .map((p) => {
      const d = p.draft as NonNullable<Player["draft"]>;
      return {
        pick: d.pick,
        round: d.round,
        club: teamRef(clubs.get(d.cid)),
        from: from(d.cid, d.originalCid),
        player: prospect(p),
      };
    });
  const picks = cache.getAll("draftPicks").filter((p) => p.season === s);
  const toCome: DraftSlotView[] = picks
    .filter((p) => p.pick !== undefined)
    .map((p) => ({
      pick: p.pick as number,
      round: p.round,
      club: teamRef(clubs.get(p.cid)),
      from: from(p.cid, p.originalCid),
      player: null,
    }));
  const current = s === game.season;
  const next = current ? nextPick(picks, s) : null;
  // Ordered by the lottery, the first pick is on the clock from the draft's day.
  const clock = game.phase === "draft" ? next : null;
  return {
    season: s,
    status:
      s > game.season
        ? "class"
        : next
          ? "on"
          : made.length > 0 || s < game.season
            ? "over"
            : "notOrdered",
    seasons,
    lotteryDate: seasonDate(s, config.competitions.keyDates.draftLottery ?? "06-05"),
    draftDate: seasonDate(s, config.competitions.keyDates.draft ?? "06-15"),
    lottery: current ? lotteryPool(session, picks) : null,
    userCid: game.userCid,
    onTheClock: clock?.pick ?? null,
    yourTurn: clock?.cid === game.userCid,
    slots: [...made, ...toCome].sort((a, b) => a.pick - b.pick),
    prospects: availableProspects(players, s)
      .sort((a, b) => b.ovr - a.ovr || b.pot - a.pot || a.pid - b.pid)
      .map(prospect),
  };
}

/**
 * This season's lottery pool, from the tables (the final ones once the season is over),
 * with each slot's draw once the lottery is made; null before a league match is played.
 */
function lotteryPool(
  session: LeagueSession,
  picks: readonly DraftPick[],
): DraftLotteryRow[] | null {
  const { cache, config } = session;
  const draft = config.competitions.draft;
  const game = cache.get("meta", "game") as GameMeta;
  const tables = playedTables(session, seasonFixtures(session, game.season));
  if (!draft || !tables) return null;
  const clubs = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  const leagues = new Map(config.competitions.leagues.map((l) => [l.id, l.name]));
  return draft.lotteryPool.flatMap((slot) => {
    const cid = tables[slot.league]?.[slot.position - 1];
    if (cid === undefined) return [];
    const first = picks.find((p) => p.round === 1 && p.originalCid === cid);
    return [
      {
        club: teamRef(clubs.get(cid)),
        league: leagues.get(slot.league) ?? slot.league,
        position: slot.position,
        odds: slot.odds,
        pick: first?.pick ?? null,
        owner: first && first.cid !== cid ? teamRef(clubs.get(first.cid)) : null,
      },
    ];
  });
}

/**
 * The picks each club holds, the soonest first (call the result with a club ID): each with
 * its number once the lottery has set it or, for this season's draft before then, where it
 * projects (the projection made once for every club).
 */
export function heldPicks(session: LeagueSession): (cid: number) => DraftPickRow[] {
  const { cache, config } = session;
  const draft = config.competitions.draft;
  const game = cache.get("meta", "game") as GameMeta;
  const clubs = cache.getAll("clubs");
  const byCid = new Map(clubs.map((c) => [c.cid, c]));
  const all = cache.getAll("draftPicks");
  const unordered = all.some((p) => p.season === game.season && p.pick === undefined);
  const slots =
    draft && unordered
      ? projectedSlots(
          { config, clubs, players: cache.getAll("players") },
          game.date,
          playedTables(session, seasonFixtures(session, game.season)),
        )
      : null;
  const row = (p: DraftPick): DraftPickRow => {
    const slot =
      p.season === game.season && p.pick === undefined ? slots?.get(p.originalCid) : undefined;
    return {
      season: p.season,
      round: p.round,
      from: p.originalCid === p.cid ? null : teamRef(byCid.get(p.originalCid)),
      pick: p.pick ?? null,
      projected:
        slot === undefined || !draft
          ? null
          : {
              pick: (p.round - 1) * clubs.length + slot,
              lottery: slot <= draft.lotteryPool.length,
            },
    };
  };
  const order = (a: DraftPickRow, b: DraftPickRow) =>
    a.season - b.season ||
    a.round - b.round ||
    (a.pick ?? a.projected?.pick ?? 0) - (b.pick ?? b.projected?.pick ?? 0);
  return (cid) =>
    all
      .filter((p) => p.cid === cid)
      .map(row)
      .sort(order);
}

/** Club `cid`'s picks (`heldPicks`), and its own picks other clubs hold. */
export function draftPicksView(session: LeagueSession, cid: number): DraftPicksView {
  const { cache, config } = session;
  if (!config.competitions.draft) throw noDraft();
  const club = cache.get("clubs", cid);
  if (!club) throw new GameError(`There's no club ${cid} in this game.`);
  const byCid = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  return {
    club: teamRef(club),
    picks: heldPicks(session)(cid),
    tradedAway: cache
      .getAll("draftPicks")
      .filter((p) => p.originalCid === cid && p.cid !== cid)
      .sort((a, b) => a.season - b.season || a.round - b.round)
      .map((p) => ({ season: p.season, round: p.round, holder: teamRef(byCid.get(p.cid)) })),
  };
}
