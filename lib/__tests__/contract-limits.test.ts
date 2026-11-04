import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ROLL_CONSTANTS } from "../roll";

describe("contract limits agreement", () => {
  it("matches constants defined in Roll.sol", () => {
    const solPath = resolve(__dirname, "../../contracts/src/Roll.sol");
    const solContent = readFileSync(solPath, "utf8");

    // MAX_NAME_BYTES = 48
    expect(solContent).toContain("MAX_NAME_BYTES = 48");
    expect(ROLL_CONSTANTS.MAX_NAME_BYTES).toBe(48);

    // MIN_DUES = 0.001 ether
    expect(solContent).toContain("MIN_DUES = 0.001 ether");
    expect(ROLL_CONSTANTS.MIN_DUES).toBe(1000000000000000n);

    // MAX_DUES = 100_000 ether
    expect(solContent).toContain("MAX_DUES = 100_000 ether");
    expect(ROLL_CONSTANTS.MAX_DUES).toBe(100000000000000000000000n);

    // MIN_PERIOD = 1 days
    expect(solContent).toContain("MIN_PERIOD = 1 days");
    expect(ROLL_CONSTANTS.MIN_PERIOD).toBe(86400);

    // MAX_PERIOD = 366 days
    expect(solContent).toContain("MAX_PERIOD = 366 days");
    expect(ROLL_CONSTANTS.MAX_PERIOD).toBe(31622400);

    // MAX_AHEAD = 3
    expect(solContent).toContain("MAX_AHEAD = 3");
    expect(ROLL_CONSTANTS.MAX_AHEAD).toBe(3);

    // MAX_MEMBERS = 500
    expect(solContent).toContain("MAX_MEMBERS = 500");
    expect(ROLL_CONSTANTS.MAX_MEMBERS).toBe(500);

    // MAX_LEAD = 90 days
    expect(solContent).toContain("MAX_LEAD = 90 days");
    expect(ROLL_CONSTANTS.MAX_LEAD).toBe(7776000);

    // MAX_PAGE = 50
    expect(solContent).toContain("MAX_PAGE = 50");
    expect(ROLL_CONSTANTS.MAX_PAGE).toBe(50);
  });
});
