# CODEX_STATUS

## Latest Completed Work

- Fixed the remaining hidden-capture valuation leak from commit `e9dae70`.
- `targetValue()` now returns `hiddenPieceValue()` immediately for unrevealed captured pieces.
- Capture gain for hidden advisor/horse/minor appearances now uses the same expected hidden value.
- Hidden rook/cannon appearances keep only the explicit public activity modifier, not full material value.
- `directMajorCapture` now requires the captured piece to be revealed; hidden rook/cannon/horse appearances are not treated as definite major captures.
- Added focused hidden-capture regression tests in `tests/fair_hidden_values.test.ts`.
- Fixed Fair AI hidden-piece evaluation so unrevealed pieces are not valued from `realType`.
- Added MVP hidden-piece expected value:
  - base `hiddenExpectedValue`
  - small activity bonus for hidden rook/cannon appearance
  - small discount for hidden minor/pawn appearances
- Restricted connected-advisor value to revealed real advisors only.
- Updated Fair AI move text/debug report paths so hidden captures do not reveal actual `realType`.
- Added unsafe material check detection for capture-checks that lose material and can be simply answered.
- Added one-ply `createsMateThreat` trace/bonus for non-checking moves that create an immediate next-move win.
- Kept Oracle/Debug entrypoints available; Fair AI remains the official recommendation path.

## Files Changed

- `src/ai/simpleAi.ts`
  - Fair hidden value helpers now avoid unrevealed `realType`.
  - Hidden major/cannon/rook helpers use `originalType`.
  - Connected advisor requires both advisors to be revealed real advisors.
  - Added `unsafeMaterialCheck` and `createsMateThreat` scoring/trace.
  - Tightened protected pawn-soldier attack handling.
- `src/ai/aiWeights.ts`
  - Added minimal weights for hidden expected value and new tactical scoring.
- `src/ai/aiTrace.ts`
  - Added trace fields for unsafe material checks and mate-threat creation.
- `src/ai/aiDebugReport.ts`
  - Fair report notation no longer reveals hidden capture realType.
  - Prints the new trace fields.
- `src/ai/aiPanelRecommendations.ts`
  - Explicitly requests Fair-safe hidden capture notation for the main debug report.
- `src/components/AiPanel.tsx`
  - Main Fair AI recommendation displays hidden captures without revealing actual realType.
- `src/game/moveNotation.ts`
  - Added optional safe notation for hidden captures.
- `tests/rules.test.ts`
  - Updated the edge-rook pressure regression to allow a real pawn-line horse guard over ordinary pawn development.
- `tests/fair_hidden_values.test.ts`
  - Verifies hidden advisor/horse expected capture value, hidden advisor connected-advisor exclusion, and hidden rook non-major forcing behavior.
- `package.json`
  - Runs the new hidden-value regression test after the existing rules test.

## Verification

- `npm test`: passed after the hidden-capture regression update.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.

Build note:
- Vite still reports an existing CSS minify warning about `.playbackMoveScroll`; build output succeeds.

## Known Limits

- Hidden-piece expected value is still a fixed MVP, not a remaining-pool probability model.
- `createsMateThreat` is a one-ply direct-win check, not a minimax search.
- `unsafeMaterialCheck` is a heuristic safety downgrade, not a full exchange tree.
- Belief State, Monte Carlo, OCR, Ponder, backend/database, and full self-learning remain out of scope.

## GitHub

- Commit/push for this round: pending until the final git steps complete.
