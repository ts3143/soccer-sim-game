import { describe, expect, it } from "vitest";
import { formatDay } from "./dates";

describe("formatDay", () => {
  it("writes game dates the same way in every browser", () => {
    expect(formatDay("2028-01-31")).toBe("31 Jan 2028");
    expect(formatDay("2027-09-01")).toBe("1 Sep 2027");
    expect(formatDay("2026-10-20T21:15:00.000Z")).toBe("20 Oct 2026");
  });
});
