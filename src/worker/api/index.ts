import type { UiEvents, WorkerApi, WorkerKind } from "../../common/api";
import type { ApiHandlers, RpcHost } from "../../common/rpc";
import { listLeagues } from "../db/globalDb";
import { acceptJobOffer, gameState, play } from "../league/game";
import {
  bidForPlayer,
  contractTalks,
  proposeLoan,
  renewContract,
  respondToOffer,
  setWageShare,
  signPlayer,
  userOffers,
} from "../league/market";
import { createLeague, deleteLeague, openLeague } from "../league/session";
import { getClubChoices, getLeagueOverview, getSquad } from "../views/inspector";
import { runLabBatch, simulateLabMatch, startLabMatch, stepLabMatch } from "../views/matchLab";
import { getClubLab, searchPlayers } from "../views/clubLab";
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

    async acceptJobOffer(lid, cid) {
      const session = await openLeague(lid);
      await acceptJobOffer(session, cid);
      const state = gameState(session);
      host.broadcast("gameChanged", { lid, state });
      await announceLeagues();
      return state;
    },

    async getInbox(lid) {
      const { cache } = await openLeague(lid);
      return cache.getAll("inbox").sort((a, b) => b.mid - a.mid);
    },

    async getContractTalks(lid, pid) {
      return contractTalks(await openLeague(lid), pid);
    },

    async renewContract(lid, pid, years) {
      const session = await openLeague(lid);
      await renewContract(session, pid, years);
      return contractTalks(session, pid);
    },

    async bidForPlayer(lid, pid, fee) {
      return bidForPlayer(await openLeague(lid), pid, fee);
    },

    async signPlayer(lid, pid, years) {
      const session = await openLeague(lid);
      await signPlayer(session, pid, years);
      return contractTalks(session, pid);
    },

    async getOffers(lid) {
      return userOffers(await openLeague(lid));
    },

    async proposeLoan(lid, pid, cid, length, wageShare) {
      return proposeLoan(await openLeague(lid), pid, cid, length, wageShare);
    },

    async getClubLab(lid) {
      return getClubLab(lid);
    },

    async searchPlayers(lid, query) {
      return searchPlayers(lid, query);
    },

    async setWageShare(lid, share) {
      await setWageShare(await openLeague(lid), share);
      return getClubLab(lid);
    },

    async respondToOffer(lid, oid, accept) {
      const session = await openLeague(lid);
      await respondToOffer(session, oid, accept);
      return userOffers(session);
    },

    async markInboxRead(lid, mid) {
      const { cache } = await openLeague(lid);
      const message = cache.get("inbox", mid);
      if (message && !message.read) {
        cache.put("inbox", { ...message, read: true });
        await cache.flush();
      }
    },
  };
}
