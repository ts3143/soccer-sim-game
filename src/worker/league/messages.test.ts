import { expect, it } from "vitest";
import type { InboxMessage } from "../../common/schema";
import { withPlayerReferences } from "./messages";
const message: InboxMessage = {
  mid: 1,
  date: "2026-07-01",
  season: 2026,
  kind: "transfer",
  subject: "Signed John Smith",
  body: "John Smith joins on a free.",
  read: false,
};
const players = [{ pid: 7, firstName: "John", lastName: "Smith" }];
it("adds safe player references to legacy messages without altering the saved object", () => {
  expect(withPlayerReferences([message], players)[0]?.players).toEqual([
    { pid: 7, name: "John Smith" },
  ]);
  expect(message.players).toBeUndefined();
});
it("preserves explicit IDs and message-time names even when players are gone or names are ambiguous", () => {
  const signed = { ...message, players: [{ pid: 9, name: "John Smith" }] };
  expect(withPlayerReferences([signed], players)[0]).toBe(signed);
  expect(withPlayerReferences([signed], [])[0]?.players).toEqual(signed.players);
  expect(
    withPlayerReferences(
      [message],
      [...players, { pid: 8, firstName: "John", lastName: "Smith" }],
    )[0]?.players,
  ).toEqual([]);
});
it("does not automatically link incidental names in board messages", () => {
  expect(
    withPlayerReferences([{ ...message, kind: "board" }], players)[0]?.players,
  ).toBeUndefined();
});
