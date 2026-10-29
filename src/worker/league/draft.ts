/** The user's picks in the draft (SPEC §17.5); the AI's are made by the Play options. */
import { GameError } from "../../common/errors";
import type { GameMeta } from "../../common/schema";
import { availableProspects, draftPlayer, nextPick } from "../season/draft";
import { emptyLog } from "../season/offseason";
import { assertNotLive, loopWorld, meta, queued, saveDraftLog } from "./game";
import type { LeagueSession } from "./session";

/** The user's club picks `pid`: it must be on the clock and the prospect still there. */
export function draftProspect(session: LeagueSession, pid: number): Promise<void> {
  return queued(session, async () => {
    assertNotLive(session);
    const game = meta<GameMeta>(session, "game");
    const world = loopWorld(session, game.season);
    const dp = game.phase === "draft" ? nextPick(world.draftPicks ?? [], game.season) : null;
    if (!dp || dp.cid !== game.userCid) throw new GameError("It isn't your pick in the draft.");
    const player = availableProspects(world.players, game.season).find((p) => p.pid === pid);
    if (!player) throw new GameError("That prospect isn't available in this draft.");
    const log = emptyLog();
    draftPlayer(world, dp, player, game.date, log);
    saveDraftLog(session, world, log);
    await session.cache.flush();
  });
}
