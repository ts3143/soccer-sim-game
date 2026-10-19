import type { UiEvents, WorkerApi, WorkerKind } from "../../common/api";
import type { ApiHandlers, RpcHost } from "../../common/rpc";
import { listLeagues } from "../db/globalDb";
import { acceptJobOffer, gameState, play } from "../league/game";
import {
  changeLive,
  getLive,
  getLiveLineup,
  setLiveLineup,
  stepLive,
  watchNextMatch,
} from "../league/live";
import {
  bidForPlayer,
  contractTalks,
  listPlayer,
  proposeLoan,
  releasePlayer,
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
import { getFreeAgents, getTransferMarket } from "../views/market";
import { getTactics, previewTactics, saveTactics } from "../views/tactics";
import { getCups, getSchedule, getStandings } from "../views/competitions";
import { getDashboard, markAllInboxRead } from "../views/dashboard";
import {
  getFinances,
  getHistory,
  getPowerRankings,
  getTeamHistory,
  getTransactions,
} from "../views/history";
import { getBoxScore, getGameLog } from "../views/matches";
import { getPlayer, getTeamSquad } from "../views/players";
import {
  getInjuries,
  getLeagueLeaders,
  getPlayerRatings,
  getPlayerStats,
  getTeamStats,
} from "../views/stats";
import { getSeasonLab } from "../views/seasonLab";
import { getLeagueShell } from "../views/shell";

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

    async getLeagueShell(lid) {
      return getLeagueShell(lid);
    },

    async getDashboard(lid) {
      return getDashboard(lid);
    },

    async getTeamSquad(lid, cid) {
      return getTeamSquad(lid, cid);
    },

    async getPlayer(lid, pid) {
      return getPlayer(lid, pid);
    },

    async getBoxScore(lid, fid) {
      return getBoxScore(lid, fid);
    },

    async getGameLog(lid, cid, season) {
      return getGameLog(lid, cid, season);
    },

    async getLeagueLeaders(lid, leagueId, season) {
      return getLeagueLeaders(lid, leagueId, season);
    },

    async getPlayerRatings(lid) {
      return getPlayerRatings(lid);
    },

    async getPlayerStats(lid, season, competition) {
      return getPlayerStats(lid, season, competition);
    },

    async getTeamStats(lid, leagueId, season) {
      return getTeamStats(lid, leagueId, season);
    },

    async getInjuries(lid) {
      return getInjuries(lid);
    },
    async getFreeAgents(lid) {
      return getFreeAgents(lid);
    },
    async getTransferMarket(lid) {
      return getTransferMarket(lid);
    },
    async listPlayer(lid, pid, asking) {
      await listPlayer(await openLeague(lid), pid, asking);
      return getTransferMarket(lid);
    },
    async releasePlayer(lid, pid) {
      return releasePlayer(await openLeague(lid), pid);
    },
    async getTactics(lid, cid) {
      return getTactics(lid, cid);
    },
    async previewTactics(lid, setup, mode) {
      return previewTactics(lid, setup, mode);
    },
    async saveTactics(lid, setup) {
      return saveTactics(lid, setup);
    },

    async getHistory(lid) {
      return getHistory(lid);
    },

    async getTeamHistory(lid, cid) {
      return getTeamHistory(lid, cid);
    },

    async getTransactions(lid, season) {
      return getTransactions(lid, season);
    },

    async getPowerRankings(lid) {
      return getPowerRankings(lid);
    },

    async getFinances(lid, season) {
      return getFinances(lid, season);
    },

    async getStandings(lid, leagueId, season) {
      return getStandings(lid, leagueId, season);
    },

    async getCups(lid, competition, season) {
      return getCups(lid, competition, season);
    },

    async getSchedule(lid, week) {
      return getSchedule(lid, week);
    },

    async markAllInboxRead(lid) {
      await markAllInboxRead(lid);
    },

    async getGameState(lid) {
      return gameState(await openLeague(lid));
    },

    async playGame(lid, option) {
      const session = await openLeague(lid);
      const report =
        option === "watchNextMatch" ? await watchNextMatch(session) : await play(session, option);
      host.broadcast("gameChanged", { lid, state: gameState(session) });
      return report;
    },
    async getLiveMatch(lid, from) {
      return getLive(await openLeague(lid), from);
    },
    async stepLiveMatch(lid, possessions, from, autoPause) {
      const session = await openLeague(lid);
      const view = await stepLive(session, possessions, from, autoPause);
      if (view.report) host.broadcast("gameChanged", { lid, state: gameState(session) });
      return view;
    },
    async changeLiveMatch(lid, changes, from) {
      return changeLive(await openLeague(lid), changes, from);
    },
    async getLiveLineup(lid) {
      return getLiveLineup(await openLeague(lid));
    },
    async setLiveLineup(lid, setup, mode) {
      return setLiveLineup(await openLeague(lid), setup, mode);
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
