# Roll

> Collect club dues. See who's paid up.

Roll is a transparent, on-chain dues roll for clubs, running groups, co-working associations, and circles. A treasurer opens a club with fixed periodic dues and period duration; members pay for one or more periods (up to three ahead), and anyone can inspect the wall of pigeonholes to see who is paid through, who is ahead, and who is in arrears.

## Features
- **Pigeonhole Wall (Archetype BH)**: Visual grid displaying each member tag with accessible status flags (paid through, ahead count, arrears count, removed).
- **Periodic Dues with Monotonic Counter**: Members pay by period index; new members start at current period, while lapsed members pay through their arrears.
- **Prepayment Cap**: Up to 3 periods ahead maximum.
- **Treasurer Role & Handover**: Treasurers can remove members, hand over the treasurer key to a successor, and withdraw accumulated dues safely.
- **Pull Payment**: Invariant `balance == Σ pending` guarantees exact conservation of funds.

## Verification & Testing
- **Foundry**: 18 unit/fuzz tests + stateful invariant test (`256 runs, 32,768 calls, 0 reverts`).
- **Mutation Testing**: 19/25 mutants killed; 6 boundary/equivalent pagination survivors explained in `contracts/DECISIONS.md`.
- **Vitest**: Unit tests (`lib/__tests__/roll.test.ts`, `contract-limits.test.ts`) and Anvil integration tests (`test/integration/roll.test.ts`).
- **Gates**: All four verification scripts (`check-ui-contract`, `check-tokens`, `check-distinct`, `check-honesty`) exit 0.

## Local Stack
Run the local stack to seed 4 clubs across various states:
```bash
node scripts/local-stack.mjs
```
Then start the development UI:
```bash
npm run dev
```
