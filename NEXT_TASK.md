# NEXT_TASK

## Completed This Round

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

1. Add real-game regression positions for unsafe capture-checks and high-risk equal exchanges.
2. Add a small UI/debug label that distinguishes Fair AI text from Oracle/Debug text more clearly.
3. Expand mate-threat detection only after profiling performance on mobile.
4. Later: Belief State / remaining-pool probability model.
5. Later: Threat Map MVP.

## Do Not Do Unless Explicitly Requested

- Do not rewrite `recommendMove`.
- Do not change Board UI.
- Do not change move notation schema or game record schema.
- Do not add backend, database, login, OCR, Ponder, Monte Carlo, or full self-learning.
- Do not weaken the Fair AI permission boundary.
