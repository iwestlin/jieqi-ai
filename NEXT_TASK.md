# NEXT_TASK

## Completed This Round

- Added strict Move Priority Gate for Fair AI recommendation selection.
- Added priority tiers:
  - Tier 0 direct win / block immediate win.
  - Tier 1 safety gate / high-value threat defense.
  - Tier 2 safe material capture.
  - Tier 3 productive forcing move.
  - Tier 4 structure / opening / endgame plan.
  - Tier 5 low-priority, unsafe, aimless, or repetitive move.
- Final move choice now filters by the best available tier before comparing detailed scores.
- Added material capture rank for safe material ordering: rook, cannon/horse, high minor, low minor, none.
- Added priority gate trace/debug fields and regression tests.
- Split edge-rook pawn-line guard logic by left/right side.
- Separated 1/9-file edge rook pressure from direct 3/7-file pawn-line rook attacks.
- Added trace/debug output for edge rook threat side, threatened pawn-line column, same-side horse guard, and direct pawn-line rook threat.
- Added unsafe hidden recapture exchange scoring for revealed major captures of low-value targets.
- Added regression tests for side-specific horse guards and unsafe revealed-rook captures.
- Aligned `hasClearGain` with exchange safety.
- Moved exchange-risk flags before `hasClearGain` so unsafe exchanges no longer look like clear gains to downstream heuristics.
- Added `hasClearGain` trace/debug report output.
- Added regression coverage for high-risk neutral exchange, hidden mover low-value capture, and true net-positive exchange.
- Fixed unsafe exchange and pawn-soldier sacrifice scoring.
- High-risk equal exchanges with hidden-major recapture risk are no longer marked safe or productive.
- Safe capture priority now requires real positive exchange value.
- Revealed major captures now require positive exchange value before receiving safe-major priority.
- Hidden movers now compare expected hidden value against capture gain, so high-value hidden movers no longer get safe-capture credit for eating low-value targets.
- Hidden pawn-soldiers walking into revealed pawn attack now lose opening/development bonuses and receive the full sacrifice penalty even if protected.
- Added trace/debug report fields for high-risk neutral exchange, hidden-mover low-value capture, and pawn-soldier self-sacrifice.
- Added regression tests for unsafe neutral exchange, hidden pawn-soldier sacrifice, hidden rook eating revealed pawn, and genuinely safe net-positive exchange.
- Fixed the `targetValue()` hidden-capture leak from commit `e9dae70`.
- Hidden captured pieces now use expected value before any piece-specific target valuation.
- Hidden rook/cannon/horse appearances no longer count as definite `directMajorCapture` forcing targets.
- Added hidden-capture value regression tests.
- Fair AI hidden-piece evaluation no longer reads unrevealed `realType`.
- Unrevealed pieces now use fixed expected value plus public `originalType` activity modifiers.
- Hidden advisors no longer trigger connected-advisor value.
- Fair AI recommendation text no longer reveals hidden capture realType.
- Unsafe material capture-checks are downgraded when the opponent can answer simply.
- Non-checking moves can receive a small bonus when they create a direct next-move mate threat.

## Suggested Next Tasks

1. Add real-game regression positions for strict priority tier edge cases.
2. Add real-game regression positions for unsafe capture-checks and high-risk equal exchanges.
3. Add a small UI/debug label that distinguishes Fair AI text from Oracle/Debug text more clearly.
4. Expand mate-threat detection only after profiling performance on mobile.
5. Later: Belief State / remaining-pool probability model.
6. Later: Threat Map MVP.

## Do Not Do Unless Explicitly Requested

- Do not rewrite `recommendMove`.
- Do not change Board UI.
- Do not change move notation schema or game record schema.
- Do not add backend, database, login, OCR, Ponder, Monte Carlo, or full self-learning.
- Do not weaken the Fair AI permission boundary.
