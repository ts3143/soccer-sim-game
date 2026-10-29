/**
 * Re-sign Players (SPEC §17.6): the user's final-year players, whether each would talk and
 * what he asks, against this season's cap and the wages already committed for the next.
 */
import type { ResigningView } from "../../common/api";
import { leagueById } from "../../common/config/competitions";
import { GameError } from "../../common/errors";
import type { GameMeta } from "../../common/schema";
import { contractClub } from "../../common/status";
import { owedWages } from "../finance/finance";
import { clubCap } from "../finance/softCap";
import { loopWorld } from "../league/game";
import { contractTalks } from "../league/market";
import type { LeagueSession } from "../league/session";
import { yearsLeft } from "../market/market";
import { seasonDate } from "../schedule/calendar";
import { capView } from "./cap";

export function resigningView(session: LeagueSession): ResigningView {
  const { config } = session;
  if (config.switches.renewals !== "resigningPeriod") {
    throw new GameError("Contracts are renewed in the transfer windows in this world.");
  }
  const game = session.cache.get("meta", "game") as GameMeta;
  const world = loopWorld(session, game.season);
  const user = world.clubs.find((c) => c.cid === game.userCid);
  if (!user) throw new Error("The save has no user club");
  const keyDates = config.competitions.keyDates;
  const closes = seasonDate(game.season, keyDates.contractsExpire ?? "06-30");
  const players = world.players
    .filter((p) => p.status === "club" && p.cid === user.cid && yearsLeft(p, game.date) === 1)
    .sort((a, b) => b.ovr - a.ovr || a.pid - b.pid)
    .map((p) => {
      const talks = contractTalks(session, p.pid);
      return {
        pid: p.pid,
        name: talks.name,
        nationality: p.nationality,
        position: p.position,
        age: talks.age,
        ovr: p.ovr,
        pot: p.pot,
        wage: talks.wage,
        mood: Math.round(talks.mood.value * 100) / 100,
        willing: talks.mood.willing,
        ask: Math.min(...talks.asks.map((a) => a.wage)),
      };
    });
  const committed =
    world.players
      .filter((p) => p.contract && contractClub(p) === user.cid && p.contract.expires > closes)
      .reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0) +
    owedWages(user, `${game.season + 1}-07-01`);
  return {
    open: game.phase === "resigning",
    opens: seasonDate(game.season, keyDates.resigningOpens ?? "06-16"),
    closes,
    players,
    cap: capView(session, user, world.players, game.season, game.date),
    next: {
      committed,
      cap: clubCap(config.competitions, user, game.season + 1),
      league: leagueById(config.competitions, user.leagueId).name,
    },
  };
}
