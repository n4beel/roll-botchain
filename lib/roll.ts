export const ROLL_CONSTANTS = {
  MAX_NAME_BYTES: 48,
  MIN_DUES: 1000000000000000n, // 0.001 ether
  MAX_DUES: 100000000000000000000000n, // 100_000 ether
  MIN_PERIOD: 86400, // 1 days
  MAX_PERIOD: 31622400, // 366 days (366 * 86400)
  MAX_AHEAD: 3,
  MAX_MEMBERS: 500,
  MAX_LEAD: 7776000, // 90 days (90 * 86400)
  MAX_PAGE: 50,
} as const;

export interface ClubInfo {
  id: bigint;
  treasurer: `0x${string}`;
  startsAt: bigint;
  periodSecs: number;
  memberCount: number;
  dues: bigint;
  name: string;
}

export interface StandingInfo {
  paidThrough: number;
  currentPeriod: number;
  offset: bigint;
  removed: boolean;
  statusText: string;
  statusTone: "current" | "ahead" | "behind" | "removed" | "not_joined";
}

/**
 * Calculates current period index of a club at time `now`.
 * Before `startsAt`, it is period 0.
 */
export function currentPeriod(startsAt: bigint, periodSecs: number, now: bigint): number {
  if (now < startsAt) {
    return 0;
  }
  if (periodSecs <= 0) return 0;
  return Number((now - startsAt) / BigInt(periodSecs));
}

/**
 * standingOf(paidThrough, current)
 * offset = paidThrough - current - 1
 * offset = 0: paid through current period
 * offset > 0: ahead by offset periods
 * offset < 0: behind / arrears by |offset| periods
 */
export function standingOf(paidThrough: number, current: number, joined: boolean = true, removed: boolean = false): StandingInfo {
  const offset = BigInt(paidThrough) - BigInt(current) - 1n;

  if (removed) {
    return {
      paidThrough,
      currentPeriod: current,
      offset,
      removed: true,
      statusText: "Removed",
      statusTone: "removed",
    };
  }

  if (!joined && paidThrough === 0) {
    return {
      paidThrough: 0,
      currentPeriod: current,
      offset,
      removed: false,
      statusText: "Not joined",
      statusTone: "not_joined",
    };
  }

  if (offset === 0n) {
    return {
      paidThrough,
      currentPeriod: current,
      offset,
      removed: false,
      statusText: "Paid through",
      statusTone: "current",
    };
  }

  if (offset > 0n) {
    return {
      paidThrough,
      currentPeriod: current,
      offset,
      removed: false,
      statusText: `+${offset} ahead`,
      statusTone: "ahead",
    };
  }

  return {
    paidThrough,
    currentPeriod: current,
    offset,
    removed: false,
    statusText: `${Math.abs(Number(offset))} behind`,
    statusTone: "behind",
  };
}

/**
 * Max periods member can pay right now (up to 3 ahead of currentPeriod).
 * For a new member, base is currentPeriod -> max is 3 periods.
 * For an existing member, base is paidThrough.
 * Capped so newThrough - currentPeriod <= 3.
 */
export function maxPayable(paidThrough: number, current: number, joined: boolean = true): number {
  const base = joined ? paidThrough : current;
  if (base <= current) {
    // In arrears or at current.
    // They can pay to catch up to current, plus up to 3 ahead.
    const maxTarget = current + ROLL_CONSTANTS.MAX_AHEAD;
    const canPay = maxTarget - base;
    return Math.min(ROLL_CONSTANTS.MAX_AHEAD, Math.max(1, canPay));
  }
  // base > current: they are already ahead
  const ahead = base - current;
  if (ahead >= ROLL_CONSTANTS.MAX_AHEAD) return 0;
  return ROLL_CONSTANTS.MAX_AHEAD - ahead;
}

/**
 * Calculates start and end timestamps of a given period index.
 */
export function periodRange(startsAt: bigint, periodSecs: number, periodIndex: number): { start: bigint; end: bigint } {
  const pSecs = BigInt(periodSecs);
  const start = startsAt + BigInt(periodIndex) * pSecs;
  const end = start + pSecs;
  return { start, end };
}

/**
 * Calculates the exact end timestamp of the period the member is paid through.
 * If paidThrough is 0, they have paid 0 periods, end is startsAt.
 */
export function periodEnd(startsAt: bigint, periodSecs: number, paidThrough: number): bigint {
  return startsAt + BigInt(paidThrough) * BigInt(periodSecs);
}
