import { expect, it } from "vitest";
import { POSITIONS, RATING_CODES, ratingsConfig } from "../common/config/ratings";
import { RATING_COLUMNS, ratingColumns, shortRatingName } from "./ratingsLayout";

it("places every config display group in exactly one column, and every rating once", () => {
  const groups = new Set(Object.values(ratingsConfig.ratingGroups));
  expect(RATING_COLUMNS.flat().sort()).toEqual([...groups].sort());
  const codes = ratingColumns(null).flatMap((c) => c.flatMap((g) => g.rows.map((r) => r.code)));
  expect([...codes].sort()).toEqual([...RATING_CODES].sort());
});

it("groups FM style: technical, mental and physical, with set pieces and goalkeeping apart", () => {
  const [technical, middle, physical] = ratingColumns(null).map((column) =>
    column.map((g) => `${g.title}: ${g.rows.map((r) => r.code).join(" ")}`),
  );
  expect(technical).toEqual(["Technical: fin lsh hdr drb spa lpa crs tkl"]);
  expect(middle).toEqual(["Mental: oiq diq wrk ant", "Set pieces: stp pen"]);
  expect(physical).toEqual(["Physical: hgt str spd jmp end", "Goalkeeping: gkr gko gkh"]);
});

it("marks heavy-weight ratings key and medium-weight ones useful for the position", () => {
  const marked = (position: (typeof POSITIONS)[number], tier: "key" | "useful") =>
    ratingColumns(position)
      .flat()
      .flatMap((g) => g.rows)
      .filter((r) => r.importance === tier)
      .map((r) => r.code)
      .sort();
  expect(marked("CB", "key")).toEqual(["diq", "hdr", "str", "tkl"]);
  expect(marked("CB", "useful")).toEqual(["ant", "hgt", "jmp", "spd"]);
  expect(marked("GK", "key")).toEqual(["gkh", "gko", "gkr"]);
  for (const position of POSITIONS) {
    const weights = ratingsConfig.positions[position].weights;
    expect(marked(position, "key")).toEqual(
      RATING_CODES.filter((c) => (weights[c] ?? 0) >= 3).sort(),
    );
  }
  expect(
    ratingColumns(null)
      .flat()
      .flatMap((g) => g.rows)
      .some((r) => r.importance),
  ).toBe(false);
});

it("shortens long names; the full name stays for the tooltip", () => {
  expect(shortRatingName("Dribbling (incl. first touch)")).toBe("Dribbling");
  expect(shortRatingName("Anticipation (reading and cutting out passes)")).toBe("Anticipation");
  expect(shortRatingName("GK one-on-ones")).toBe("One-on-ones");
  expect(shortRatingName("Defensive IQ")).toBe("Defensive IQ");
});
