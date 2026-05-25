import { describe, expect, it } from "vitest";
import { getBerlinLocalParts, getScheduledAction } from "../time";

describe("Berlin time scheduling", () => {
  it("treats 08:50 Berlin winter time as a nudge", () => {
    const action = getScheduledAction(new Date("2026-01-01T07:50:00.000Z"));

    expect(action).toEqual({
      kind: "nudge",
      local: { date: "2026-01-01", hour: 8, minute: 50 }
    });
  });

  it("treats 08:50 Berlin summer time as a nudge", () => {
    const action = getScheduledAction(new Date("2026-07-01T06:50:00.000Z"));

    expect(action).toEqual({
      kind: "nudge",
      local: { date: "2026-07-01", hour: 8, minute: 50 }
    });
  });

  it("ignores sparse cron invocations that only exist for DST coverage", () => {
    const action = getScheduledAction(new Date("2026-01-01T06:50:00.000Z"));

    expect(action.kind).toBe("none");
    expect(action.local).toEqual({ date: "2026-01-01", hour: 7, minute: 50 });
  });

  it("detects the 22:00 poster time in winter and summer", () => {
    expect(getScheduledAction(new Date("2026-01-01T21:00:00.000Z")).kind).toBe("poster");
    expect(getScheduledAction(new Date("2026-07-01T20:00:00.000Z")).kind).toBe("poster");
  });

  it("formats Berlin local date parts without locale-specific slashes", () => {
    expect(getBerlinLocalParts(new Date("2026-05-25T10:36:00.000Z")).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
