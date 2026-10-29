import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { worlds } from "../../common/config/worlds";
import type { GameMeta, MetaRows } from "../../common/schema";
import { listLeagues, registerLeague } from "../db/globalDb";
import { openLeagueDb, writeWorld } from "../db/leagueDb";
import { generateWorld, type World } from "../generate/world";
import { formationById } from "../../common/config/formations";
import { isSenior } from "../../common/status";
import { bestXi } from "../core/lineup";
import { evaluateWorld } from "../generate/checks";
import { getTeamSquad } from "../views/players";
import { gameState, play, queued } from "./game";
import { closeLeague, createLeague, deleteLeague, onLeagueOpened, openLeague } from "./session";

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});

// Each test generates and saves a whole world: seconds locally, more on CI.
const SLOW = { timeout: 60_000 };

describe("league saves", () => {
  it("creates a full save that reopens with every acceptance check passing", SLOW, async () => {
    const league = await createLeague({
      world: "classic",
      name: "Test league",
      seed: "session-test",
      userCid: 0,
    });
    expect(league).toMatchObject({ lid: 1, name: "Test league", season: 2026 });
    expect((await listLeagues()).map((l) => l.lid)).toEqual([1]);

    await closeLeague(); // like a reload: read everything back from IndexedDB
    const { cache } = await openLeague(league.lid);
    const clubs = cache.getAll("clubs");
    const players = cache.getAll("players");
    const xiStrength = new Map(
      clubs.map((c) => [
        c.cid,
        bestXi(
          players.filter((p) => p.cid === c.cid && isSenior(p)),
          formationById(c.tactics.formation),
        ).meanOvr,
      ]),
    );
    expect(clubs).toHaveLength(62);
    const clubSeasons = cache.getAll("clubSeasons").filter((r) => r.season === 2026);
    expect(
      evaluateWorld({ clubs, clubSeasons, players, xiStrength }, worlds.classic).filter(
        (c) => !c.pass,
      ),
    ).toEqual([]);
    for (const club of clubs) {
      expect(Math.abs((xiStrength.get(club.cid) ?? 0) - club.strengthTarget)).toBeLessThanOrEqual(
        1,
      );
    }

    const game = cache.get("meta", "game") as GameMeta;
    expect(game).toMatchObject({
      seed: "session-test",
      season: 2026,
      phase: "preseason",
      userCid: 0,
    });
    expect(cache.get("meta", "rng")).toBeTruthy();
    // The save records its world, and the session plays it (SPEC §17.1).
    expect(cache.get("meta", "world")).toMatchObject({ id: "classic" });
    expect((await openLeague(league.lid)).config).toBe(worlds.classic);
  });

  it("creates a Super League save: 48 clubs in three tiers, no academies", SLOW, async () => {
    const league = await createLeague({
      world: "superLeague",
      name: "Super",
      seed: "super-save",
      userCid: 0,
    });
    expect(league.clubName).toBe("Madrid Blancos");
    const session = await openLeague(league.lid);
    expect(session.config).toBe(worlds.superLeague);
    expect(session.cache.get("meta", "world")).toMatchObject({ id: "superLeague" });
    expect(session.cache.getAll("clubs")).toHaveLength(48);
    expect(session.cache.getAll("players").some((p) => p.status === "academy")).toBe(false);
    // Each tier's double round robin: 16 clubs × 15 home matches, no cups.
    const fixtures = session.cache.getAll("fixtures");
    expect(fixtures).toHaveLength(3 * 16 * 15);
    expect(new Set(fixtures.map((f) => f.competition))).toEqual(new Set(["STAR", "GOLD", "BLUE"]));
    expect(gameState(session)).toMatchObject({ season: 2026, phase: "preseason", window: null });
    await deleteLeague(league.lid);
  });

  it("writes a names file into that save only: the same world, other names", SLOW, async () => {
    const base = { world: "superLeague" as const, name: "Names", seed: "names-file", userCid: 0 };
    const plain = await createLeague(base);
    const renamed = await createLeague({
      ...base,
      names: { mbl: { name: "Madrid Whites", short: "Whites", abbr: "MWH" }, lyo: { abbr: "LYN" } },
    });
    expect([plain.clubName, renamed.clubName]).toEqual(["Madrid Blancos", "Madrid Whites"]);
    const read = async (lid: number) => {
      const session = await openLeague(lid);
      return {
        clubs: session.cache.getAll("clubs"),
        players: JSON.stringify(session.cache.getAll("players")),
        fixtures: JSON.stringify(session.cache.getAll("fixtures")),
      };
    };
    const a = await read(plain.lid);
    const b = await read(renamed.lid);
    expect(b.players).toBe(a.players);
    expect(b.fixtures).toBe(a.fixtures);
    const names = (c: (typeof a.clubs)[number]) => ({ ...c, name: "", short: "", abbr: "" });
    expect(b.clubs.map(names)).toEqual(a.clubs.map(names));
    expect(b.clubs.find((c) => c.code === "mbl")).toMatchObject({
      name: "Madrid Whites",
      short: "Whites",
      abbr: "MWH",
    });
    expect(b.clubs.find((c) => c.code === "lyo")).toMatchObject({
      name: "Lyon Gones",
      abbr: "LYN",
    });
    // The bundled world keeps its names; a bad file is refused.
    expect(worlds.superLeague.clubs[0]?.name).toBe("Madrid Blancos");
    await expect(createLeague({ ...base, names: { xyz: { name: "X" } } })).rejects.toThrow(
      /Names file: There's no club "xyz"/,
    );
    await deleteLeague(plain.lid);
    await deleteLeague(renamed.lid);
  });

  it("opens a save from before the Super League as Classic, and plays on", SLOW, async () => {
    const createdAt = "2026-07-01T00:00:00.000Z";
    const world = generateWorld({
      config: worlds.classic,
      seed: "pre-super-league",
      name: "Old",
      userCid: 0,
      createdAt,
    });
    const league = await registerLeague({
      name: "Old",
      createdAt,
      lastPlayedAt: createdAt,
      clubName: world.clubs[0]?.name ?? "",
      season: 2026,
    });
    // A league DB v7 save: its world row has no id.
    const old = await openLeagueDb(league.lid, 7);
    const unnamed: Partial<MetaRows["world"]> = { ...world.meta.world };
    delete unnamed.id;
    await writeWorld(old, {
      ...world,
      meta: { ...world.meta, world: unnamed as MetaRows["world"] },
    } satisfies World);
    old.close();

    const session = await openLeague(league.lid);
    expect(session.config).toBe(worlds.classic);
    expect(session.cache.get("meta", "world")).toEqual({ ...unnamed, id: "classic" });
    await play(session, "oneWeek");
    const report = await play(session, "untilNextMatch");
    expect(report.matchesPlayed).toBeGreaterThan(10);
    await deleteLeague(league.lid);
  });

  it("serves a club's squad and academy from the save", SLOW, async () => {
    const squad = await getTeamSquad(1, 0);
    expect(squad.players.length).toBeGreaterThanOrEqual(22);
    expect(squad.academy.length).toBeGreaterThan(0);
    expect(squad.strength).toBeGreaterThan(40);
  });

  it("gives a random seed when none is entered, and deletes saves", SLOW, async () => {
    const second = await createLeague({ world: "classic", name: " ", seed: "", userCid: 5 });
    expect(second.lid).toBe(2);
    expect(second.name).toBe("League 2");
    const game = (await openLeague(2)).cache.get("meta", "game") as GameMeta;
    expect(game.seed).toMatch(/^[0-9a-f]{8}$/);
    await deleteLeague(2);
    expect((await listLeagues()).map((l) => l.lid)).toEqual([1]);
    await expect(openLeague(2)).rejects.toThrow("no league 2");
  });

  it(
    "lets an action under way finish before another league opens, then stops the closed one's",
    SLOW,
    async () => {
      const other = await createLeague({
        world: "classic",
        name: "Other",
        seed: "other",
        userCid: 3,
      });
      const first = await openLeague(1);
      let finished = false;
      const running = queued(first, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        finished = true;
      });
      const opened: number[] = [];
      onLeagueOpened((lid) => opened.push(lid));
      const second = await openLeague(other.lid);
      expect(finished).toBe(true);
      await running;
      expect(opened).toEqual([other.lid]);
      expect(gameState(second).playing).toBeNull();
      await expect(queued(first, () => Promise.resolve(1))).rejects.toThrow(
        /another tab opened a different one/,
      );
      await deleteLeague(other.lid);
    },
  );
});
