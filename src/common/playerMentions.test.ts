import { expect, it } from "vitest";
import { createPlayerMentionSplitter } from "./playerMentions";

it("links exact names in both subjects and bodies, preserving punctuation and repeated mentions", () => {
  const split = createPlayerMentionSplitter([{ pid: 7, name: "André O’Neil" }]);
  const parts = split("Signed André O’Neil. André O’Neil joins on a free.");
  expect(parts.filter((p) => p.pid === 7)).toHaveLength(2);
  expect(parts.map((p) => p.text).join("")).toBe(
    "Signed André O’Neil. André O’Neil joins on a free.",
  );
  expect(split("Bid for André O’Neil").some((p) => p.pid === 7)).toBe(true);
});
it("does not guess between players with the same name", () => {
  const split = createPlayerMentionSplitter([
    { pid: 1, name: "John Smith" },
    { pid: 2, name: "John Smith" },
  ]);
  expect(split("Bid for John Smith")).toEqual([{ text: "Bid for John Smith" }]);
  expect(createPlayerMentionSplitter([{ pid: 2, name: "John Smith" }])("John Smith")).toEqual([
    { text: "John Smith", pid: 2 },
  ]);
});
it("respects name boundaries and escapes regex punctuation", () => {
  const split = createPlayerMentionSplitter([
    { pid: 1, name: "João Silva" },
    { pid: 2, name: "A. Test (Jr)" },
  ]);
  expect(
    split("XJoão Silva, João Silvason, João Silva-Jones").every((p) => p.pid === undefined),
  ).toBe(true);
  expect(split("Signed A. Test (Jr).").some((p) => p.pid === 2)).toBe(true);
});
it("prefers a longer complete name and keeps message text as plain text", () => {
  const split = createPlayerMentionSplitter([
    { pid: 1, name: "John Smith" },
    { pid: 2, name: "John Smith Junior" },
  ]);
  expect(split("John Smith Junior")).toEqual([{ text: "John Smith Junior", pid: 2 }]);
  expect(split("<script>alert('x')</script>")).toEqual([{ text: "<script>alert('x')</script>" }]);
  expect(createPlayerMentionSplitter([])("")).toEqual([{ text: "" }]);
});
