/** The app shell's view of an open league (M5): names, clubs for the team picker, state. */
import type { LeagueShell } from "../../common/api";
import { competitionsConfig } from "../../common/config/competitions";
import type { GameMeta } from "../../common/schema";
import { gameState } from "../league/game";
import { openLeague } from "../league/session";

export async function getLeagueShell(lid: number): Promise<LeagueShell> {
  const session = await openLeague(lid);
  const game = session.cache.get("meta", "game") as GameMeta;
  return {
    lid,
    name: game.name,
    userCid: game.userCid,
    firstSeason: competitionsConfig.firstSeason,
    clubs: session.cache
      .getAll("clubs")
      .map((c) => ({
        cid: c.cid,
        name: c.name,
        short: c.short,
        abbr: c.abbr,
        code: c.code,
        leagueId: c.leagueId,
        colors: c.colors,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    leagues: competitionsConfig.leagues.map((l) => ({ id: l.id, name: l.name })),
    state: gameState(session),
  };
}
