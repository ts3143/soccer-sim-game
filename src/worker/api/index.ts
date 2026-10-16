import type { UiEvents, WorkerApi, WorkerKind } from "../../common/api";
import type { ApiHandlers, RpcHost } from "../../common/rpc";
import { listLeagues } from "../db/globalDb";
import { gameState, play } from "../league/game";
import { createLeague, deleteLeague, openLeague } from "../league/session";
import { getClubChoices, getLeagueOverview, getSquad } from "../views/inspector";
import { runLabBatch, simulateLabMatch, startLabMatch, stepLabMatch } from "../views/matchLab";
import { getSeasonLab } from "../views/seasonLab";

/** The worker's implementation of WorkerApi. The compiler checks it against the contract. */
export function createHandlers(
  host: RpcHost<WorkerApi, UiEvents>,
  kind: WorkerKind,
  startedAt: string,
): ApiHandlers<WorkerApi> {
  const announceLeagues = async () =>
    host.broadcast("leaguesChanged", { leagues: await listLeagues() });

  return {
    getStatus: () => ({ kind, startedAt, connectedTabs: host.endpointCount }),
    listLeagues,
    getClubChoices,

    async createLeague(input) {
      const league = await createLeague(input);
      await announceLeagues();
      return league;
    },

    async deleteLeague(lid) {
      await deleteLeague(lid);
      await announceLeagues();
    },

    getLeagueOverview,
    getSquad,
    simulateLabMatch,
    startLabMatch,
    stepLabMatch,
    runLabBatch,

    async getGameState(lid) {
      return gameState(await openLeague(lid));
    },

    async playGame(lid, option) {
      const session = await openLeague(lid);
      const report = await play(session, option);
      host.broadcast("gameChanged", { lid, state: gameState(session) });
      return report;
    },

    getSeasonLab,
  };
}
