# Roll — Design and Architecture Decisions

## 1. Why Prepayment is Capped at Three Periods (`MAX_AHEAD = 3`)
- **Risk Mitigation**: Clubs are dynamic associations where treasurers can be handed over or members can depart. Capping prepayment to 3 periods ensures member dues exposure is strictly bounded while allowing convenient quarterly or multi-week batch payments.
- **Spec Constraint**: Spec §2 enforces `1 <= periods <= MAX_AHEAD (3)` and rejects payments attempting to advance `newThrough - currentPeriod > MAX_AHEAD` with `TooFarAhead(maxPeriods)`.

## 2. Why Dues are Non-Refundable
- **Operational Simplicity**: Dues are immediately credited to the club's `pending[treasurer]` balance under a pull-payment pattern.
- **No Invariant Drift**: Withdrawing or refactoring past periods would introduce insolvency risks, disputes over partially completed periods, or complex clawback logic. Prepaid periods stay with the club.

## 3. Pull Payment vs Direct Push
- Dues payments do not call `msg.sender.call{value: ...}` inside `pay()`. Instead, `pending[treasurer] += msg.value` records the amount, and the treasurer calls `withdraw()` under a reentrancy guard.
- This prevents a malicious or gas-guzzling treasurer contract from blocking members paying dues.

## 4. Arrears vs Join Logic
- A brand new member joining the club starts at `currentPeriod` (no historical debt is assessed against newcomers).
- An existing member who has lapsed pays dues from `paidThrough` onwards, ensuring they catch up on unpaid past periods before advancing ahead.
