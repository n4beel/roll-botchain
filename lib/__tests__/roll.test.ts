import { describe, it, expect } from "vitest";
import {
  currentPeriod,
  standingOf,
  maxPayable,
  periodRange,
  periodEnd,
  ROLL_CONSTANTS,
} from "../roll";

describe("roll library", () => {
  const startsAt = 1_000_000n;
  const periodSecs = 86400; // 1 day

  describe("currentPeriod", () => {
    it("returns 0 before startsAt", () => {
      expect(currentPeriod(startsAt, periodSecs, startsAt - 100n)).toBe(0);
      expect(currentPeriod(startsAt, periodSecs, startsAt - 1n)).toBe(0);
    });

    it("returns 0 at exactly startsAt", () => {
      expect(currentPeriod(startsAt, periodSecs, startsAt)).toBe(0);
    });

    it("returns 0 within period 0", () => {
      expect(currentPeriod(startsAt, periodSecs, startsAt + 86399n)).toBe(0);
    });

    it("advances at period boundary", () => {
      expect(currentPeriod(startsAt, periodSecs, startsAt + 86400n)).toBe(1);
      expect(currentPeriod(startsAt, periodSecs, startsAt + 86400n * 5n + 10n)).toBe(5);
    });
  });

  describe("standingOf", () => {
    it("handles not joined", () => {
      const s = standingOf(0, 2, false, false);
      expect(s.statusTone).toBe("not_joined");
      expect(s.statusText).toBe("Not joined");
      expect(s.offset).toBe(-3n); // 0 - 2 - 1 = -3
    });

    it("handles removed", () => {
      const s = standingOf(5, 2, true, true);
      expect(s.removed).toBe(true);
      expect(s.statusTone).toBe("removed");
      expect(s.statusText).toBe("Removed");
    });

    it("handles paid through current period (offset = 0)", () => {
      // cur = 0, paidThrough = 1 -> offset = 1 - 0 - 1 = 0
      const s = standingOf(1, 0, true, false);
      expect(s.offset).toBe(0n);
      expect(s.statusTone).toBe("current");
      expect(s.statusText).toBe("Paid through");
    });

    it("handles ahead (offset > 0)", () => {
      // cur = 0, paidThrough = 3 -> offset = 3 - 0 - 1 = 2
      const s = standingOf(3, 0, true, false);
      expect(s.offset).toBe(2n);
      expect(s.statusTone).toBe("ahead");
      expect(s.statusText).toBe("+2 ahead");
    });

    it("handles behind (offset < 0)", () => {
      // cur = 5, paidThrough = 1 -> offset = 1 - 5 - 1 = -5
      const s = standingOf(1, 5, true, false);
      expect(s.offset).toBe(-5n);
      expect(s.statusTone).toBe("behind");
      expect(s.statusText).toBe("5 behind");
    });
  });

  describe("maxPayable", () => {
    it("allows up to 3 for new member at current", () => {
      expect(maxPayable(0, 0, false)).toBe(3);
      expect(maxPayable(0, 5, false)).toBe(3);
    });

    it("caps ahead payments correctly for existing member", () => {
      // cur = 0, paidThrough = 1 (offset 0, paid through this period) -> can pay up to 3 more (1+3 = 4, 4-0 = 4 > 3 -> wait, maxTarget is 0 + 3 = 3. base = 1 -> can pay 2)
      // Spec: newThrough - currentPeriod <= 3. base is 1. newThrough = 1 + 2 = 3. 3 - 0 = 3 <= 3!
      expect(maxPayable(1, 0, true)).toBe(2);
      expect(maxPayable(2, 0, true)).toBe(1);
      expect(maxPayable(3, 0, true)).toBe(0);
    });

    it("allows 3 periods if in deep arrears", () => {
      // cur = 10, paidThrough = 1. base = 1.
      // maxTarget is 10 + 3 = 13. canPay = 12. Capped at MAX_AHEAD = 3.
      expect(maxPayable(1, 10, true)).toBe(3);
    });
  });

  describe("periodRange and periodEnd", () => {
    it("computes correct timestamps", () => {
      const p0 = periodRange(startsAt, periodSecs, 0);
      expect(p0.start).toBe(startsAt);
      expect(p0.end).toBe(startsAt + BigInt(periodSecs));

      const pe3 = periodEnd(startsAt, periodSecs, 3);
      expect(pe3).toBe(startsAt + 3n * BigInt(periodSecs));
    });
  });
});
