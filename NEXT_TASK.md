# NEXT_TASK

## Completed This Round

- Fair AI hidden-piece evaluation no longer reads unrevealed `realType`.
- Unrevealed pieces now use fixed expected value plus public `originalType` activity modifiers.
- Hidden advisors no longer trigger connected-advisor value.
- Fair AI recommendation text no longer reveals hidden capture realType.
- Unsafe material capture-checks are downgraded when the opponent can answer simply.
- Non-checking moves can receive a small bonus when they create a direct next-move mate threat.

## Suggested Next Tasks

1. Add regression tests for specific unsafe capture-check examples from real games.
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
