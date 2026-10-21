import { expect, it } from "vitest";
import { formationById, formationsConfig } from "../../common/config/formations";
import { POSITIONS } from "../../common/config/ratings";
import { formationCoordinates, POSITION_SPOTS, positionFit } from "./pitchLayout";

it("places every configured XI in distinct, bounded pitch positions without overlapping cards", () => {
  for (const f of formationsConfig.formations) {
    const points = formationCoordinates(f);
    expect(points).toHaveLength(11);
    points.forEach((p, i) => {
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(90);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(90);
      expect(f.slots[i]?.side === "L" ? p.x < 50 : f.slots[i]?.side === "R" ? p.x > 50 : true).toBe(
        true,
      );
      for (const q of points.slice(i + 1))
        expect(Math.abs(p.x - q.x) >= 17 || Math.abs(p.y - q.y) >= 12).toBe(true);
    });
    expect(points[0]?.y).toBe(Math.max(...points.map((p) => p.y))); // GK nearest our goal
  }
});
it("puts wingbacks into midfield for a back three and defence for a back five", () => {
  const heights = (id: string) => {
    const f = formationById(id);
    const points = formationCoordinates(f);
    return f.slots.flatMap((s, i) => (s.position === "WB" ? [points[i]!.y] : []));
  };
  expect(heights("3-5-2")).toEqual([43, 43]);
  expect(heights("5-3-2")).toEqual([75, 75]);
});
it("covers all ten position groups and both sides of every wide position", () => {
  expect(new Set(POSITION_SPOTS.map((s) => s.position))).toEqual(new Set(POSITIONS));
  expect(POSITION_SPOTS).toHaveLength(14);
  for (const p of ["FB", "WB", "WM", "W"])
    expect(
      POSITION_SPOTS.filter((s) => s.position === p)
        .map((s) => s.side)
        .sort(),
    ).toEqual(["L", "R"]);
});
it("uses transparent OVR gaps for relative suitability", () => {
  expect(positionFit(75, 75)).toBe("best");
  expect(positionFit(72, 75)).toBe("comfortable");
  expect(positionFit(71, 75)).toBe("cover");
  expect(positionFit(67, 75)).toBe("cover");
  expect(positionFit(66, 75)).toBe("lower");
});
