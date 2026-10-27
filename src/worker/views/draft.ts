/** The draft (SPEC §17.5): its order, the picks made and to come, the prospects left. */
import type { DraftProspectView, DraftSlotView, DraftView } from "../../common/api";
import { exactAge } from "../../common/dates";
import type { GameMeta, Player } from "../../common/schema";
import type { LeagueSession } from "../league/session";
import { fullName } from "../season/offseason";
import { availableProspects, nextPick } from "../season/draft";
import { teamRef } from "./common";

export function draftView(session: LeagueSession): DraftView {
  const { cache } = session;
  const game = cache.get("meta", "game") as GameMeta;
  const season = game.season;
  const clubs = new Map(cache.getAll("clubs").map((c) => [c.cid, c]));
  const players = cache.getAll("players");
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
    .filter((p) => p.draft?.season === season)
    .map((p) => {
      const d = p.draft as NonNullable<Player["draft"]>;
      const club = teamRef(clubs.get(d.cid));
      return {
        pick: d.pick,
        round: d.round,
        club,
        from: from(d.cid, d.originalCid),
        player: prospect(p),
      };
    });
  const picks = cache.getAll("draftPicks");
  const toCome: DraftSlotView[] = picks
    .filter((p) => p.season === season && p.pick !== undefined)
    .map((p) => ({
      pick: p.pick as number,
      round: p.round,
      club: teamRef(clubs.get(p.cid)),
      from: from(p.cid, p.originalCid),
      player: null,
    }));
  const next = nextPick(picks, season);
  const slots = [...made, ...toCome].sort((a, b) => a.pick - b.pick);
  return {
    season,
    status: next ? "on" : made.length > 0 ? "over" : "notOrdered",
    userCid: game.userCid,
    onTheClock: next?.pick ?? null,
    yourTurn: game.phase === "draft" && next?.cid === game.userCid,
    slots,
    prospects: availableProspects(players, season)
      .sort((a, b) => b.ovr - a.ovr || b.pot - a.pot || a.pid - b.pid)
      .map(prospect),
  };
}
