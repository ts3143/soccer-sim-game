import type { UiEvents, WorkerApi, WorkerKind } from "../../common/api";
import type { ApiHandlers, RpcHost } from "../../common/rpc";
import { listLeagues } from "../db/globalDb";
import { acceptJobOffer, gameState, play, queued, renameLeague } from "../league/game";
import {
  changeLive,
  getLive,
  getLiveBoard,
  getLiveLineup,
  previewLiveChanges,
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
import {
  assertClaimed,
  claimLeague,
  createLeague,
  deleteLeague,
  onLeagueOpened,
  openLeague,
} from "../league/session";
import { getClubChoices } from "../views/newLeague";
import { getFreeAgents, getTransferMarket, searchPlayers } from "../views/market";
import { fairTicketPrice, getAcademy, getClubFinances, getJobOffers } from "../views/club";
import { decideAcademyPlayer, setBudgetDials, setTicketPrice } from "../league/club";
import { getTactics, previewTactics, saveTactics } from "../views/tactics";
import { getCups, getSchedule, getStandings } from "../views/competitions";
import { draftView } from "../views/draft";
import { draftProspect } from "../league/draft";
import { makeTradeWork, proposeTrade, respondToTradeOffer, tradingBlock } from "../league/trade";
import { getDashboard, markAllInboxRead } from "../views/dashboard";
import {
  getFinances,
  getHistory,
  getPowerRankings,
  getTeamHistory,
  getTransactions,
} from "../views/history";
import { getBoxScore, getGameLog, getMatchPreview } from "../views/matches";
import { getPlayer, getTeamSquad } from "../views/players";
import {
  getInjuries,
  getLeagueLeaders,
  getPlayerRatings,
  getPlayerStats,
  getTeamStats,
} from "../views/stats";
import { getLeagueShell } from "../views/shell";
import type { LeagueSession } from "../league/session";

/** The worker's implementation of WorkerApi. The compiler checks it against the contract. */
export function createHandlers(
  host: RpcHost<WorkerApi, UiEvents>,
  kind: WorkerKind,
  startedAt: string,
): ApiHandlers<WorkerApi> {
  const announceLeagues = async () =>
    host.broadcast("leaguesChanged", { leagues: await listLeagues() });
  onLeagueOpened((lid) => host.broadcast("leagueOpened", { lid }));
  /** Tells every tab that a league's data changed, so open pages reload. */
  const announce = (session: LeagueSession) => {
    // A league closed meanwhile (another tab opened a different one) has nothing to announce.
    if (!session.closed)
      host.broadcast("gameChanged", { lid: session.lid, state: gameState(session) });
  };
  /** Runs a change to the save, then tells every tab. */
  const change = async <T>(lid: number, run: (session: LeagueSession) => Promise<T>) => {
    const session = await openLeague(lid);
    const value = await run(session);
    announce(session);
    return value;
  };

  const handlers: ApiHandlers<WorkerApi> = {
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

    async openLeague(lid) {
      await claimLeague(lid);
    },

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
    async getMatchPreview(lid, fid) {
      return getMatchPreview(lid, fid);
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
    async getAcademy(lid) {
      return getAcademy(lid);
    },
    async getJobOffers(lid) {
      return getJobOffers(lid);
    },
    async renameLeague(lid, name) {
      await change(lid, (session) => queued(session, () => renameLeague(session, name)));
      await announceLeagues();
    },
    async decideAcademyPlayer(lid, pid, decision) {
      return change(lid, (session) => decideAcademyPlayer(session, pid, decision));
    },
    async getClubFinances(lid) {
      return getClubFinances(lid);
    },
    async setBudgetDials(lid, dials) {
      await change(lid, (session) => setBudgetDials(session, dials));
      return getClubFinances(lid);
    },
    async setTicketPrice(lid, price) {
      const fair = await fairTicketPrice(lid);
      await change(lid, (session) => setTicketPrice(session, price, fair));
      return getClubFinances(lid);
    },
    async setClubWageShare(lid, share) {
      await change(lid, (session) => setWageShare(session, share));
      return getClubFinances(lid);
    },
    async listPlayer(lid, pid, asking) {
      await change(lid, (session) => listPlayer(session, pid, asking));
      return getTransferMarket(lid);
    },
    async releasePlayer(lid, pid) {
      return change(lid, (session) => releasePlayer(session, pid));
    },
    async getTactics(lid, cid) {
      return getTactics(lid, cid);
    },
    async previewTactics(lid, setup, mode) {
      return previewTactics(lid, setup, mode);
    },
    async saveTactics(lid, setup) {
      // Not announced: only the Tactics page shows it, and its editor starts over on a change.
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
      await change(lid, () => markAllInboxRead(lid));
    },

    async getGameState(lid) {
      return gameState(await openLeague(lid));
    },

    async playGame(lid, option) {
      // Every tab hears when it starts ("Playing…") and when it's done.
      return change(lid, (session) =>
        option === "watchNextMatch"
          ? watchNextMatch(session, "user", () => announce(session))
          : play(session, option, () => announce(session)),
      );
    },
    async getDraft(lid) {
      return draftView(await openLeague(lid));
    },
    async draftProspect(lid, pid) {
      return change(lid, async (session) => {
        await draftProspect(session, pid);
        return draftView(session);
      });
    },
    async proposeTrade(lid, proposal) {
      return change(lid, (session) => proposeTrade(session, proposal));
    },
    async makeTradeWork(lid, proposal) {
      return makeTradeWork(await openLeague(lid), proposal);
    },
    async respondToTradeOffer(lid, mid, accept) {
      return change(lid, (session) => respondToTradeOffer(session, mid, accept));
    },
    async getTradingBlock(lid, give) {
      return tradingBlock(await openLeague(lid), give);
    },
    async getLiveMatch(lid, from) {
      return getLive(await openLeague(lid), from);
    },
    async stepLiveMatch(lid, possessions, from, autoPause) {
      const session = await openLeague(lid);
      const view = await stepLive(session, possessions, from, autoPause);
      if (view.report) announce(session);
      return view;
    },
    async changeLiveMatch(lid, changes, from) {
      return changeLive(await openLeague(lid), changes, from);
    },
    async getLiveBoard(lid) {
      return getLiveBoard(await openLeague(lid));
    },
    async previewLiveChanges(lid, changes) {
      return previewLiveChanges(await openLeague(lid), changes);
    },
    async getLiveLineup(lid) {
      return getLiveLineup(await openLeague(lid));
    },
    async setLiveLineup(lid, setup, mode) {
      return setLiveLineup(await openLeague(lid), setup, mode);
    },

    async acceptJobOffer(lid, cid) {
      const session = await change(lid, async (session) => {
        await acceptJobOffer(session, cid);
        return session;
      });
      await announceLeagues();
      return gameState(session);
    },

    async getContractTalks(lid, pid) {
      return contractTalks(await openLeague(lid), pid);
    },

    async renewContract(lid, pid, years) {
      return change(lid, async (session) => {
        await renewContract(session, pid, years);
        return contractTalks(session, pid);
      });
    },

    async bidForPlayer(lid, pid, fee) {
      return change(lid, (session) => bidForPlayer(session, pid, fee));
    },

    async signPlayer(lid, pid, years) {
      return change(lid, async (session) => {
        await signPlayer(session, pid, years);
        return contractTalks(session, pid);
      });
    },

    async proposeLoan(lid, pid, cid, length, wageShare) {
      return change(lid, (session) => proposeLoan(session, pid, cid, length, wageShare));
    },

    async searchPlayers(lid, query) {
      return searchPlayers(lid, query);
    },

    async respondToOffer(lid, oid, accept) {
      return change(lid, async (session) => {
        await respondToOffer(session, oid, accept);
        return userOffers(session);
      });
    },

    async markInboxRead(lid, mid) {
      const session = await openLeague(lid);
      const message = session.cache.get("inbox", mid);
      if (message && !message.read) {
        session.cache.put("inbox", { ...message, read: true });
        await session.cache.flush();
        announce(session);
      }
    },
  };

  // Calls about a league (their first argument is its id) go through only for the league a
  // tab last opened on purpose; the rest manage the list of leagues.
  const unguarded = new Set<string>([
    "getStatus",
    "listLeagues",
    "getClubChoices",
    "createLeague",
    "deleteLeague",
    "openLeague",
  ]);
  const guarded: Record<string, unknown> = { ...handlers };
  for (const [name, handler] of Object.entries(handlers)) {
    if (unguarded.has(name)) continue;
    const run = handler as (lid: number, ...rest: unknown[]) => unknown;
    guarded[name] = (lid: number, ...rest: unknown[]) => {
      assertClaimed(lid);
      return run(lid, ...rest);
    };
  }
  return guarded as ApiHandlers<WorkerApi>;
}
