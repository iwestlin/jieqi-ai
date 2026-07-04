# CODEX_STATUS

## Latest Completed Work

- Added a strict Move Priority Gate to Fair AI move selection.
- Candidate moves are now assigned a priority tier before final selection:
  - Tier 0: direct win / blocking immediate win.
  - Tier 1: safety gate and resolving high-value threats.
  - Tier 2: safe material captures only.
  - Tier 3: productive forcing moves.
  - Tier 4: structure, opening, endgame, and development plans.
  - Tier 5: low-priority, unsafe, aimless, or repetitive moves.
- `recommendMove` now filters to the best available tier before sorting within that tier, so lower-tier structure plans cannot beat urgent safety or safe material moves just by raw score.
- Safe material capture tiering now requires positive exchange value, `hasClearGain`, `safeCapturePriority`, and no unsafe exchange flags.
- Added material capture ranking for Tier 2 sorting:
  - `rook`
  - `cannonHorse`
  - `highMinor`
  - `lowMinor`
  - `none`
- Added priority trace/debug fields:
  - `priorityTier`
  - `priorityTierLabel`
  - `prioritySubRank`
  - `filteredByHigherPriorityTier`
  - `bestAvailablePriorityTier`
  - `materialCaptureRank`
- Repetitive / cycle forcing moves are downgraded into low-priority handling unless they have a higher tactical exception.
- Added regression coverage for:
  - unsafe exchanges not entering the safe material tier
  - safe captures filtering out lower-tier structure moves
  - material capture rank output
  - priority gate fields in debug reports
- Split edge-rook pawn-line guard evaluation by board side.
- 1/9-file revealed edge rooks now keep their threat side (`left` / `right`), so only the same-side hidden horse can receive pawn-line guard credit.
- 3/7-file pawn-line rook threats are now detected only when an enemy revealed rook legally attacks an unrevealed pawn on that exact pawn-line column.
- Added AI trace/debug fields:
  - `edgeRookThreatSide`
  - `threatenedPawnLineCol`
  - `sameSideEdgeRookHorseGuard`
  - `directPawnLineRookThreat`
- Added unsafe hidden recapture exchange handling for revealed major captures:
  - computes `moverMaterialValue`
  - computes `hiddenRecaptureMaterialLoss`
  - marks `unsafeHiddenRecaptureExchange`
  - applies `unsafeHiddenRecaptureExchangePenalty`
- Revealed rook eating a low-value elephant while a hidden major can recapture no longer counts as safe capture, clear gain, or productive forcing progress.
- Added regression tests for same-side edge rook guards, direct 3/7 pawn-line rook threats, unsafe rook-captures-elephant exchange, and safe rook-captures-rook exchange.
- Aligned `hasClearGain` with the same exchange-safety gates used by safe captures.
- Moved hidden-major low-value capture and hidden-major recapture-risk detection before `hasClearGain`.
- `hasClearGain` now rejects:
  - `exchangeNet === 0`
  - high-risk neutral exchanges
  - hidden mover low-value captures
  - premature hidden-major captures of low-value hidden targets
- Added `hasClearGain` to AI trace/debug report output.
- Expanded unsafe exchange regression tests so:
  - high-risk neutral exchange has `hasClearGain === false`
  - hidden rook eating a low-value revealed pawn has `hasClearGain === false`
  - genuinely net-positive exchange has `hasClearGain === true`
- Fixed unsafe exchange and pawn-soldier sacrifice scoring in Fair AI.
- High-risk neutral exchanges now get downgraded when a hidden major can recapture:
  - `exchangeNet <= 0`
  - reply risk crosses `highRiskExchangeThreshold`
  - no direct win or immediate-win block
- `safeCapturePriority` and `safeRevealedMajorCapture` now require positive `exchangeNet`.
- Hidden movers now compare their expected hidden value against the captured target value:
  - hidden rook/cannon expected value remains `220`
  - eating a low-value revealed pawn can no longer be treated as safe just because it captures something
- Hidden pawn-soldiers walking into a revealed pawn attack are now treated as a near-forbidden self-sacrifice unless the move directly wins or blocks an immediate win.
- Protection after the pawn-soldier move is still traced, but it no longer halves the first-layer sacrifice penalty.
- Added trace/debug fields:
  - `highRiskNeutralExchange`
  - `highRiskNeutralExchangePenalty`
  - `hiddenMoverExpectedValue`
  - `hiddenMoverLowValueLoss`
  - `hiddenMoverLowValueCapture`
  - `hiddenMoverLowValueCapturePenalty`
  - `pawnSoldierSacrificeHasTacticalJustification`
  - `pawnSoldierWalksIntoPawnAttackPenalty`
  - `pawnSoldierDevelopmentScore`
- Added regression tests for:
  - high-risk equal exchange not being safe or productive
  - protected hidden pawn-soldier still being a first-layer sacrifice into a revealed pawn
  - hidden rook eating a revealed pawn being an unfavorable hidden-mover low-value capture
  - genuinely net-positive revealed major captures staying safe
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
  - Added strict Move Priority Gate tiering and tier-aware final move selection.
  - Added material capture ranking for safe material sorting.
  - Separates unsafe material-capture checks from non-capture forcing moves so useful non-capture forcing moves are not wrongly downgraded.
  - Rejects high-risk neutral exchanges from safe/forcing productive buckets.
  - Penalizes hidden movers that proactively eat low-value targets below their expected hidden value.
  - Treats hidden pawn-soldier movement into revealed pawn attack as a full sacrifice even when protected.
  - Fair hidden value helpers now avoid unrevealed `realType`.
  - Hidden major/cannon/rook helpers use `originalType`.
  - Connected advisor requires both advisors to be revealed real advisors.
  - Added `unsafeMaterialCheck` and `createsMateThreat` scoring/trace.
  - Tightened protected pawn-soldier attack handling.
- `src/ai/aiWeights.ts`
  - Added high-risk exchange and hidden-mover low-value capture weights.
  - Raised hidden pawn-soldier revealed-pawn attack penalty to full sacrifice level.
  - Keeps minimal weights for hidden expected value and tactical scoring.
- `src/ai/aiTrace.ts`
  - Added priority tier, priority filtering, and material capture rank trace fields.
  - Added trace fields for unsafe exchanges, hidden-mover low-value capture, pawn-soldier sacrifice, unsafe material checks, and mate-threat creation.
- `src/ai/aiDebugReport.ts`
  - Prints priority tier, priority filtering, and material capture rank fields.
  - Fair report notation no longer reveals hidden capture realType.
  - Prints the new trace fields.
- `src/ai/aiPanelRecommendations.ts`
  - Explicitly requests Fair-safe hidden capture notation for the main debug report.
- `src/components/AiPanel.tsx`
  - Main Fair AI recommendation displays hidden captures without revealing actual realType.
- `src/game/moveNotation.ts`
  - Added optional safe notation for hidden captures.
- `tests/rules.test.ts`
  - Updated pawn-soldier sacrifice expectations so protection no longer cancels first-layer sacrifice.
  - Keeps the edge-rook pressure regression allowing real pawn-line horse guard over ordinary pawn development.
- `tests/fair_hidden_values.test.ts`
  - Verifies hidden advisor/horse expected capture value, hidden advisor connected-advisor exclusion, hidden rook non-major forcing behavior, unsafe neutral exchanges, hidden pawn-soldier sacrifices, hidden rook low-value capture, safe net-positive exchanges, side-specific rook pressure, unsafe revealed-major captures, and priority gate behavior.
- `package.json`
  - Runs the new hidden-value regression test after the existing rules test.

## Verification

- `npm test`: passed after priority gate regression updates.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.

Build note:
- Vite still reports an existing CSS minify warning about `.playbackMoveScroll`; build output succeeds.

## Known Limits

- Hidden-piece expected value is still a fixed MVP, not a remaining-pool probability model.
- `createsMateThreat` is a one-ply direct-win check, not a minimax search.
- `unsafeMaterialCheck` is a heuristic safety downgrade, not a full exchange tree.
- `highRiskNeutralExchange` and `hiddenMoverLowValueCapture` are still heuristic filters, not a full multi-ply exchange tree.
- `pawnSoldierSacrificeHasTacticalJustification` currently covers direct win / immediate-win block only; verified forced mate remains intentionally minimal.
- Belief State, Monte Carlo, OCR, Ponder, backend/database, and full self-learning remain out of scope.

## GitHub

- Commit/push for this round: pending until the final git steps complete.
