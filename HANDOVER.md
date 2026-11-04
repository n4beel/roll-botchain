# Handover: Roll (`roll-botchain`)

## Summary
- **Slug / Project**: `roll` / 53 (Wave 4, Batch A)
- **Tagline**: Collect club dues. See who's paid up.
- **Contract**: `Roll` in `contracts/src/Roll.sol`
- **Design Archetype**: BH · Pigeonholes (ground `#9DFF0A`, ink `#0F2200`, accent `#0F2200`)
- **Fonts**: Gelasio (headings) & Noto Sans (UI)

## Verification Gates & Results
- `forge test --gas-report`: 18 passed; 1 invariant test passed (256 runs, 32,768 calls, 0 reverts).
- `npm test`: 10 test suites passed (54 tests), including hook dependency lint and contract limits agreement.
- `npm run test:integration`: 2 test suites passed (5 tests) on Anvil (port 8653), exercising full lifecycle: open -> pay -> evm_increaseTime -> arrears -> catch up -> withdraw.
- `mutation-check.py roll`: 19/25 mutants killed. 6 survivors explained (pagination count/offset boundary clamps, secondary nonReentrant modifier, and strict inequality equivalents).
- `check-honesty.py roll`: 0 findings.
- `check-ui-contract.py roll`: ok.
- `check-tokens.py roll`: 0 undefined tokens.
- `check-distinct.py roll`: 53 projects compared; 0 pair/file problem(s).
- `npm run build`: Static and dynamic routes compiled without errors.

## Contrast Metrics (WCAG)
- Ink on Ground: 13.40:1 (passes AAA)
- Ink on Surface: 16.81:1 (passes AAA)
- Muted on Surface: 6.18:1 (passes AA)
- Accent Ink on Accent: 16.81:1 (passes AAA)
- Menu Text on Menu BG: 16.81:1 (passes AAA)
- Menu Muted on Menu BG: 4.80:1 (passes AA)

## Routes Verified
- `/`: Mosaic of all clubs, highlighting managed clubs, limitations notice.
- `/open`: Configuration form with dues, period duration (days), and start lead time.
- `/club/[id]`: The Wall of pigeonholes with accessible table equivalent, stepper for prepayment (capped at max 3 ahead), and treasurer tools (remove member, hand over, withdraw).
- `/me`: Aggregated overview of user memberships across rolls, status text, and treasurer withdraw button.
