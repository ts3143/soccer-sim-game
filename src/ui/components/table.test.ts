import { describe, expect, it } from "vitest";
import { pageCount, pageRows, sortRows } from "./table";

const rows = [
  { id: 1, name: "Bea", goals: 3 },
  { id: 2, name: "al", goals: null },
  { id: 3, name: "Cy", goals: 10 },
  { id: 4, name: "Di", goals: 3 },
];

describe("table sorting and paging", () => {
  it("sorts numbers both ways with empty values last and stable ties", () => {
    const by = (desc: boolean) =>
      sortRows(
        rows,
        (r) => r.goals,
        desc,
        (r) => r.id,
      ).map((r) => r.id);
    expect(by(true)).toEqual([3, 1, 4, 2]);
    expect(by(false)).toEqual([1, 4, 3, 2]);
  });

  it("sorts text case-insensitively", () => {
    expect(
      sortRows(
        rows,
        (r) => r.name,
        false,
        (r) => r.id,
      ).map((r) => r.name),
    ).toEqual(["al", "Bea", "Cy", "Di"]);
  });

  it("pages rows and clamps past the end", () => {
    expect(pageCount(51, 25)).toBe(3);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(51, 0)).toBe(1);
    const many = Array.from({ length: 51 }, (_, i) => i);
    expect(pageRows(many, 2, 25)).toEqual([50]);
    expect(pageRows(many, 9, 25)).toEqual([50]);
    expect(pageRows(many, 0, 0)).toHaveLength(51);
  });
});
