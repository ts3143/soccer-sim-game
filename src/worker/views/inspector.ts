/**
 * Views for the M1 generation inspector page (developer-only; replaced by the game UI
 * in M5). Everything is computed from the saved league, so the page also proves the
 * save reproduces each club's strength.
 */
import type {
  ClubChoice,
  ClubOverviewRow,
  LeagueOverview,
  SquadPlayerRow,
  SquadView,
} from "../../common/api";
import { clubDefinitions } from "../../common/config/clubs";
import { competitionsConfig, leagueById } from "../../common/config/competitions";
import { formationById } from "../../common/config/formations";
import { ratingsConfig } from "../../common/config/ratings";
import { ageOn } from "../../common/dates";
import type { Club, GameMeta, Player } from "../../common/schema";
import { bestXi, type XiPick } from "../core/lineup";
import { POSITION_INDEX } from "../core/ovr";
import { evaluateWorld } from "../generate/checks";
import { openLeague } from "../league/session";

export function getClubChoices(): ClubChoice[] {
  return clubDefinitions.map((club, cid) => ({
    cid,
    code: club.code,
    name: club.name,
    leagueId: club.league,
    leagueName: leagueById(club.league).name,
    strength: club.strength,
  }));
}

const seniorsOf = (players: Player[], cid: number) =>
  players.filter((p) => p.cid === cid && p.status === "club");

function clubXi(club: Club, players: Player[]): { seniors: Player[]; xi: XiPick } {
  const seniors = seniorsOf(players, club.cid);
  return { seniors, xi: bestXi(seniors, formationById(club.tactics.formation)) };
}

export async function getLeagueOverview(lid: number): Promise<LeagueOverview> {
  const { cache } = await openLeague(lid);
  const game = cache.get("meta", "game") as GameMeta;
  const clubs = cache.getAll("clubs").sort((a, b) => a.cid - b.cid);
  const clubSeasons = cache.getAll("clubSeasons").filter((s) => s.season === game.season);
  const players = cache.getAll("players");
  const xiStrength = new Map<number, number>();

  const rows: ClubOverviewRow[] = clubs.map((club) => {
    const { seniors, xi } = clubXi(club, players);
    xiStrength.set(club.cid, xi.meanOvr);
    const wageBill = seniors.reduce((sum, p) => sum + (p.contract?.wage ?? 0), 0);
    return {
      cid: club.cid,
      code: club.code,
      name: club.name,
      leagueId: club.leagueId,
      formation: club.tactics.formation,
      strengthTarget: club.strengthTarget,
      xiStrength: xi.meanOvr,
      seniors: seniors.length,
      academy: players.filter((p) => p.cid === club.cid && p.status === "academy").length,
      averageAge:
        seniors.reduce((sum, p) => sum + ageOn(p.birthDate, game.date), 0) / seniors.length,
      wageBill,
      revenue: club.revenueAnchor,
      squadCostRatio: wageBill / club.revenueAnchor,
      topOvr: Math.max(...seniors.map((p) => p.ovr)),
      colors: club.colors,
    };
  });

  const seniors = players.filter((p) => p.status === "club");
  const counts = new Map<number, number>();
  for (const p of seniors) counts.set(p.ovr, (counts.get(p.ovr) ?? 0) + 1);
  const bands = ratingsConfig.ovrBands.map((band, i) => {
    const max = (ratingsConfig.ovrBands[i - 1]?.min ?? 101) - 1;
    return {
      label: band.label,
      min: band.min,
      max,
      count: seniors.filter((p) => p.ovr >= band.min && p.ovr <= max).length,
    };
  });

  return {
    lid,
    name: game.name,
    seed: game.seed,
    season: game.season,
    date: game.date,
    userCid: game.userCid,
    leagues: competitionsConfig.leagues.map((l) => ({ id: l.id, name: l.name })),
    counts: {
      clubs: clubs.length,
      seniors: seniors.length,
      academy: players.filter((p) => p.status === "academy").length,
      freeAgents: players.filter((p) => p.status === "freeAgent").length,
    },
    ovrCounts: [...counts.entries()]
      .map(([ovr, count]) => ({ ovr, count }))
      .sort((a, b) => a.ovr - b.ovr),
    bands,
    clubs: rows,
    checks: evaluateWorld({ clubs, clubSeasons, players, xiStrength }),
  };
}

export async function getSquad(lid: number, cid: number): Promise<SquadView> {
  const { cache } = await openLeague(lid);
  const game = cache.get("meta", "game") as GameMeta;
  const club = cache.get("clubs", cid);
  if (!club) throw new RangeError(`No club ${cid}`);
  const players = cache.getAll("players");
  const formation = formationById(club.tactics.formation);
  const { seniors, xi } = clubXi(club, players);

  const slotByPid = new Map<number, { label: string; ovr: number; order: number }>();
  xi.playerIndexBySlot.forEach((index, slot) => {
    const player = seniors[index];
    const { position, side } = formation.slots[slot] ?? { position: "GK", side: "C" };
    if (player) {
      slotByPid.set(player.pid, {
        label: side === "C" ? position : `${position} ${side}`,
        ovr: xi.slotOvrs[slot] ?? 0,
        order: slot,
      });
    }
  });

  const row = (p: Player): SquadPlayerRow => ({
    pid: p.pid,
    name: `${p.firstName} ${p.lastName}`,
    shirtNumber: p.shirtNumber,
    position: p.position,
    secondaryPositions: p.secondaryPositions,
    age: ageOn(p.birthDate, game.date),
    nationality: p.nationality,
    nationality2: p.nationality2,
    foot: p.foot,
    heightCm: p.heightCm,
    ovr: p.ovr,
    pot: p.pot,
    wage: p.contract?.wage ?? null,
    contractExpires: p.contract?.expires ?? null,
    status: p.status === "academy" ? "academy" : "club",
    xiSlot: slotByPid.get(p.pid)?.label ?? null,
    slotOvr: slotByPid.get(p.pid)?.ovr ?? null,
  });

  const xiRows = seniors
    .filter((p) => slotByPid.has(p.pid))
    .sort((a, b) => (slotByPid.get(a.pid)?.order ?? 0) - (slotByPid.get(b.pid)?.order ?? 0));
  const others = seniors
    .filter((p) => !slotByPid.has(p.pid))
    .sort((a, b) => POSITION_INDEX[a.position] - POSITION_INDEX[b.position] || b.ovr - a.ovr);
  const academy = players
    .filter((p) => p.cid === cid && p.status === "academy")
    .sort((a, b) => b.pot - a.pot);

  return {
    cid,
    code: club.code,
    name: club.name,
    leagueId: club.leagueId,
    formation: club.tactics.formation,
    strengthTarget: club.strengthTarget,
    xiStrength: xi.meanOvr,
    colors: club.colors,
    players: [...xiRows, ...others, ...academy].map(row),
  };
}
