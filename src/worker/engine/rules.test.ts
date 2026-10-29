import { describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { Club, Player } from "../../common/schema";
import { generateWorld } from "../generate/world";
import { aiSliders } from "./aiTactics";
import { simulateMatch } from "./match";
import { prepareMatch, teamInput } from "./prepare";
import type { MatchInput, MatchResult, TeamSide } from "./types";

const world = generateWorld({
  config: worlds.classic,
  seed: "rules-test",
  name: "t",
  userCid: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
});
const squad = (cid: number): Player[] => world.players.filter((p) => p.cid === cid);
const club = (cid: number) => world.clubs[cid] as Club;
const NEUTRAL = { chanceQuality: 1, foulRate: 1, directness: 0 };
const side = (cid: number) => ({ club: club(cid), squad: squad(cid) });
const SLOW = { timeout: 60_000 };

function play(
  home: number,
  away: number,
  seed: string,
  extra: Partial<MatchInput> = {},
): MatchResult {
  return simulateMatch({
    ...prepareMatch(side(home), side(away), { seed, style: NEUTRAL }),
    ...extra,
  });
}

const subsOf = (r: MatchResult, s: TeamSide) =>
  r.keyEvents.filter((e) => e.type === "sub" && e.side === s);

describe("substitutions", () => {
  it("never exceed 5 subs in 3 windows in normal time", SLOW, () => {
    let totalSubs = 0;
    for (let i = 0; i < 200; i++) {
      const r = play(i % 20, (i + 3) % 20, `subs${i}`);
      for (const s of [0, 1] as const) {
        const t = r.teams[s];
        expect(t.subsUsed).toBeLessThanOrEqual(5);
        expect(t.windowsUsed).toBeLessThanOrEqual(3);
        expect(subsOf(r, s)).toHaveLength(t.subsUsed);
        totalSubs += t.subsUsed;
      }
    }
    expect(totalSubs / 400).toBeGreaterThan(2.5); // teams do use their bench
  });

  it("allow a 6th sub and a 4th window in extra time", SLOW, () => {
    let sawExtraTime = false;
    for (let i = 0; i < 150; i++) {
      const r = play(i % 20, (i + 1) % 20, `et${i}`, {
        knockout: { extraTime: true, penalties: true, firstLeg: null },
      });
      for (const s of [0, 1] as const) {
        expect(r.teams[s].subsUsed).toBeLessThanOrEqual(r.extraTime ? 6 : 5);
        expect(r.teams[s].windowsUsed).toBeLessThanOrEqual(r.extraTime ? 4 : 3);
      }
      sawExtraTime ||= r.extraTime;
    }
    expect(sawExtraTime).toBe(true);
  });

  it("replace injured players while subs remain, else the team plays on with 10", SLOW, () => {
    let injuries = 0;
    for (let i = 0; i < 300; i++) {
      const r = play((i % 24) + 20, ((i + 5) % 24) + 20, `inj${i}`);
      for (const event of r.keyEvents) {
        if (event.type !== "injury") continue;
        injuries++;
        const injured = r.players.find((p) => p.pid === event.pid);
        expect(injured?.injuryDays).toBeGreaterThan(0);
        const subbed = r.keyEvents.some(
          (e) => e.type === "sub" && e.outPid === event.pid && e.reason === "injury",
        );
        expect(subbed).toBe(event.replaced);
      }
    }
    expect(injuries).toBeGreaterThan(0);
  });
});

describe("cards", () => {
  it("send players off without replacing outfielders", SLOW, () => {
    let reds = 0;
    for (let i = 0; i < 400 && reds < 5; i++) {
      const r = play((i % 18) + 44, ((i + 2) % 18) + 44, `red${i}`);
      for (const event of r.keyEvents) {
        if (event.type !== "card" || event.card === "yellow") continue;
        reds++;
        const sentOff = r.players.find((p) => p.pid === event.pid);
        expect(sentOff?.redCards).toBe(1);
        expect(r.keyEvents.some((e) => e.type === "sub" && e.outPid === event.pid)).toBe(false);
      }
    }
    expect(reds).toBeGreaterThan(0);
  });

  it("are more frequent for hotheads, and pressing costs fouls and energy", SLOW, () => {
    const base = prepareMatch(side(0), side(1), { seed: "x", style: NEUTRAL });
    const allHot = {
      ...base.away,
      players: base.away.players.map((p) => ({ ...p, hothead: true })),
    };
    const pressing = {
      ...base.away,
      sliders: { ...base.away.sliders, pressing: 2 },
      aiInGame: false,
    };
    const sitting = {
      ...base.away,
      sliders: { ...base.away.sliders, pressing: -2 },
      aiInGame: false,
    };
    let fouls = { calm: 0, hot: 0, press: 0, sit: 0 };
    let energy = { press: 0, sit: 0 };
    for (let i = 0; i < 150; i++) {
      const seed = `h${i}`;
      const calm = simulateMatch({ ...base, seed });
      const hot = simulateMatch({ ...base, away: allHot, seed });
      const press = simulateMatch({ ...base, away: pressing, seed });
      const sit = simulateMatch({ ...base, away: sitting, seed });
      fouls = {
        calm: fouls.calm + calm.teams[1].fouls,
        hot: fouls.hot + hot.teams[1].fouls,
        press: fouls.press + press.teams[1].fouls,
        sit: fouls.sit + sit.teams[1].fouls,
      };
      const avgEnergy = (r: MatchResult) =>
        r.players
          .filter((p) => p.side === 1 && p.startedInSlot !== null)
          .reduce((s, p) => s + p.energyEnd, 0) / 11;
      energy = { press: energy.press + avgEnergy(press), sit: energy.sit + avgEnergy(sit) };
    }
    expect(fouls.hot).toBeGreaterThan(fouls.calm);
    expect(fouls.press).toBeGreaterThan(fouls.sit);
    expect(energy.press).toBeLessThan(energy.sit);
  });
});

describe("knockouts", () => {
  it("always produce a winner, through extra time and penalties if needed", SLOW, () => {
    let shootouts = 0;
    for (let i = 0; i < 200; i++) {
      const r = play(i % 20, (i + 10) % 20, `ko${i}`, {
        knockout: { extraTime: true, penalties: true, firstLeg: null },
      });
      expect(r.winner).not.toBeNull();
      if (r.penalties) {
        shootouts++;
        expect(r.extraTime).toBe(true);
        expect(r.homeGoals).toBe(r.awayGoals);
        const [h, a] = r.penalties.split("-").map(Number);
        expect(h).not.toBe(a);
        expect(r.winner).toBe((h as number) > (a as number) ? 0 : 1);
      } else if (!r.extraTime) {
        expect(r.homeGoals).not.toBe(r.awayGoals);
      }
    }
    expect(shootouts).toBeGreaterThan(0);
  });

  it("decide two-legged ties on aggregate, with no away-goals rule", SLOW, () => {
    for (let i = 0; i < 120; i++) {
      const firstLeg = { home: i % 3, away: (i + 1) % 3 };
      const r = play(i % 20, (i + 4) % 20, `leg${i}`, {
        knockout: { extraTime: true, penalties: true, firstLeg },
      });
      const home = firstLeg.home + r.homeGoals;
      const away = firstLeg.away + r.awayGoals;
      if (home !== away) expect(r.winner).toBe(home > away ? 0 : 1);
      else expect(r.penalties).not.toBeNull();
    }
  });

  it("give no home advantage at a neutral venue", SLOW, () => {
    let homeWins = 0;
    let neutralHomeWins = 0;
    for (let i = 0; i < 600; i++) {
      if (
        play(i % 20, (i + 9) % 20, `n${i}`).homeGoals >
        play(i % 20, (i + 9) % 20, `n${i}`).awayGoals
      )
        homeWins++;
      const n = play(i % 20, (i + 9) % 20, `n${i}`, { neutralVenue: true });
      if (n.homeGoals > n.awayGoals) neutralHomeWins++;
    }
    expect(neutralHomeWins).toBeLessThan(homeWins);
  });
});

describe("AI pre-match sliders", () => {
  it("attack against weaker teams, defend against stronger ones, and play more direct in ENG2 style", () => {
    const eng1 = world.clubs.filter((c) => c.leagueId === "ENG1");
    const top = eng1.reduce((a, b) => (b.strengthTarget > a.strengthTarget ? b : a));
    const bottom = eng1.reduce((a, b) => (b.strengthTarget < a.strengthTarget ? b : a));
    const strong = teamInput(top, squad(top.cid));
    const weak = teamInput(bottom, squad(bottom.cid));
    expect(aiSliders(strong, weak, true, 0).mentality).toBeGreaterThan(0);
    expect(aiSliders(weak, strong, false, 0).mentality).toBeLessThan(0);
    const all = world.clubs.map((c) => teamInput(c, squad(c.cid)));
    const avgDirect = (style: number) =>
      all.reduce((s, t) => s + aiSliders(t, t, true, style).directness, 0) / all.length;
    expect(avgDirect(0.5)).toBeGreaterThan(avgDirect(0));
  });
});
