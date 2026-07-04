import { recommendMove } from '../src/ai/simpleAi';
import { defaultAiWeights } from '../src/ai/aiWeights';
import { formatAiDebugReport } from '../src/ai/aiDebugReport';
import { getAllLegalMoves } from '../src/game/checkRules';
import type { Board, GameState, Move, Piece, PieceType, Side } from '../src/types/chess';

function assertEqual(actual: unknown, expected: unknown) {
  if (!Object.is(actual, expected)) {
    throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertOk<T>(value: T): asserts value is NonNullable<T> {
  if (value == null || value === false) {
    throw new Error(`expected truthy value, got ${String(value)}`);
  }
}

function test(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

function emptyBoard(): Board {
  return Array.from({ length: 10 }, () => Array.from({ length: 9 }, () => null));
}

function piece(side: Side, originalType: PieceType, realType = originalType, revealed = true): Piece {
  return {
    id: `${side}-${originalType}-${realType}-${String(revealed)}`,
    side,
    originalType,
    realType,
    revealed,
  };
}

function place(board: Board, row: number, col: number, p: Piece): Board {
  board[row][col] = p;
  return board;
}

function findMove(board: Board, side: Side, from: [number, number], to: [number, number]): Move {
  const move = getAllLegalMoves(board, side).find(m =>
    m.from.row === from[0] &&
    m.from.col === from[1] &&
    m.to.row === to[0] &&
    m.to.col === to[1]
  );
  assertOk(move);
  return move;
}

function baseBoard(): Board {
  const board = emptyBoard();
  place(board, 9, 4, piece('red', 'king'));
  place(board, 0, 4, piece('black', 'king'));
  place(board, 5, 4, piece('red', 'pawn'));
  place(board, 5, 0, piece('red', 'rook', 'rook', true));
  return board;
}

function stateWithHiddenTarget(hiddenOriginal: PieceType): { state: GameState; move: Move } {
  const board = baseBoard();
  place(board, 5, 1, piece('black', hiddenOriginal, 'rook', false));
  const move = findMove(board, 'red', [5, 0], [5, 1]);
  return { state: { board, turn: 'red', history: [], status: 'playing' }, move };
}

function singleTrace(state: GameState, move: Move) {
  const result = recommendMove(state, [move]);
  assertOk(result.traces);
  assertOk(result.traces[0]);
  return result.traces[0];
}

function tracesFor(state: GameState, moves: Move[]) {
  const result = recommendMove(state, moves);
  assertOk(result.traces);
  return result.traces;
}

function traceForMove(state: GameState, move: Move) {
  const traces = tracesFor(state, [move]);
  assertOk(traces[0]);
  return traces[0];
}

function baseHorseGuardBoard(): Board {
  const board = emptyBoard();
  place(board, 9, 4, piece('red', 'king'));
  place(board, 0, 4, piece('black', 'king'));
  place(board, 5, 4, piece('red', 'pawn', 'pawn', true));
  place(board, 9, 1, piece('red', 'horse', 'horse', false));
  place(board, 9, 7, piece('red', 'horse', 'horse', false));
  return board;
}

function horseGuardTrace(board: Board, from: [number, number], to: [number, number]) {
  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const move = findMove(board, 'red', from, to);
  return traceForMove(state, move);
}

test('capturing hidden advisor and hidden horse uses the same expected material value', () => {
  const advisorCase = stateWithHiddenTarget('advisor');
  const horseCase = stateWithHiddenTarget('horse');
  const advisorResult = recommendMove(advisorCase.state, [advisorCase.move]);
  const horseResult = recommendMove(horseCase.state, [horseCase.move]);
  assertOk(advisorResult.traces);
  assertOk(horseResult.traces);

  const expectedMinorHiddenValue =
    defaultAiWeights.hiddenExpectedValue + defaultAiWeights.hiddenMinorActivityPenalty;
  assertEqual(advisorResult.traces[0].captureGain, expectedMinorHiddenValue);
  assertEqual(horseResult.traces[0].captureGain, expectedMinorHiddenValue);
});

test('hidden advisor capture does not trigger connectedAdvisor value', () => {
  const board = baseBoard();
  place(board, 5, 1, piece('black', 'advisor', 'advisor', false));
  place(board, 5, 2, piece('black', 'advisor', 'advisor', true));
  const move = findMove(board, 'red', [5, 0], [5, 1]);
  const result = recommendMove({ board, turn: 'red', history: [], status: 'playing' }, [move]);
  assertOk(result.traces);

  const trace = result.traces[0];
  assertEqual(trace.capturedConnectedAdvisor, false);
  assertEqual(
    trace.captureGain,
    defaultAiWeights.hiddenExpectedValue + defaultAiWeights.hiddenMinorActivityPenalty
  );
});

test('hidden rook appearance is not a definite direct major capture', () => {
  const rookCase = stateWithHiddenTarget('rook');
  const result = recommendMove(rookCase.state, [rookCase.move]);
  assertOk(result.traces);

  const trace = result.traces[0];
  assertEqual(
    trace.captureGain,
    defaultAiWeights.hiddenExpectedValue + defaultAiWeights.hiddenRookCannonActivityBonus
  );
  assertEqual(trace.forcingMove, false);
  assertEqual(trace.forcingTargetKind, null);
});

test('high-risk neutral exchange is not safe or productive', () => {
  const board = baseBoard();
  board[5][0] = null;
  board[5][4] = null;
  place(board, 4, 4, piece('red', 'pawn', 'pawn', true));
  place(board, 5, 0, piece('red', 'cannon', 'cannon', true));
  place(board, 5, 1, piece('red', 'pawn', 'pawn', true));
  place(board, 5, 2, piece('black', 'cannon', 'cannon', true));
  place(board, 5, 8, piece('black', 'rook', 'rook', false));

  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const move = findMove(board, 'red', [5, 0], [5, 2]);
  const trace = singleTrace(state, move);

  assertEqual(trace.captureGain, defaultAiWeights.targetCannonValue);
  assertEqual(trace.exchangeNet, 0);
  assertEqual(trace.hiddenMajorRecaptureRisk, true);
  assertEqual(trace.highRiskNeutralExchange, true);
  assertEqual(trace.highRiskNeutralExchangePenalty, defaultAiWeights.highRiskNeutralExchangePenalty);
  assertEqual(trace.hasClearGain, false);
  assertEqual(trace.safeCapturePriority, false);
  assertEqual(trace.safeRevealedMajorCapture, false);
  assertOk(trace.forcingMoveQuality !== 'productive');
  assertOk(trace.priorityTier !== 2);
  assertEqual(trace.materialCaptureRank, 'cannonHorse');
});

test('protected hidden pawn-soldier still cannot walk into revealed pawn attack', () => {
  const board = emptyBoard();
  place(board, 9, 4, piece('red', 'king'));
  place(board, 0, 4, piece('black', 'king'));
  place(board, 5, 4, piece('red', 'pawn', 'pawn', true));
  place(board, 3, 5, piece('black', 'pawn', 'pawn', false));
  place(board, 5, 5, piece('red', 'pawn', 'pawn', true));
  place(board, 4, 0, piece('black', 'rook', 'rook', true));

  const state: GameState = { board, turn: 'black', history: [], status: 'playing' };
  const move = findMove(board, 'black', [3, 5], [4, 5]);
  const trace = singleTrace(state, move);

  assertEqual(trace.pawnSoldierWalksIntoRevealedPawnAttack, true);
  assertEqual(trace.pawnSoldierProtectedAfterAdvance, true);
  assertEqual(trace.pawnSoldierSacrificeHasTacticalJustification, false);
  assertEqual(trace.pawnSoldierSelfSacrifice, true);
  assertEqual(trace.pawnSoldierDevelopmentScore, 0);
  assertEqual(trace.openingBonus, 0);
  assertEqual(trace.pawnSoldierWalksIntoPawnAttackPenalty, defaultAiWeights.pawnSoldierWalksIntoRevealedPawnAttackPenalty);
});

test('hidden rook eating a revealed pawn is treated as low-value hidden mover capture', () => {
  const board = baseBoard();
  board[5][0] = piece('red', 'rook', 'rook', false);
  place(board, 5, 1, piece('black', 'pawn', 'pawn', true));

  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const move = findMove(board, 'red', [5, 0], [5, 1]);
  const trace = singleTrace(state, move);

  assertEqual(trace.hiddenMoverExpectedValue, defaultAiWeights.hiddenExpectedValue + defaultAiWeights.hiddenRookCannonActivityBonus);
  assertEqual(trace.captureGain, defaultAiWeights.crossedPawnTargetValue);
  assertEqual(trace.hiddenMoverLowValueLoss, 100);
  assertEqual(trace.hiddenMoverLowValueCapture, true);
  assertEqual(trace.hiddenMoverLowValueCapturePenalty, defaultAiWeights.hiddenMoverLowValueCapturePenalty);
  assertEqual(trace.hasClearGain, false);
  assertEqual(trace.safeCapturePriority, false);
});

test('net-positive revealed major capture is still safe', () => {
  const board = baseBoard();
  place(board, 5, 1, piece('black', 'cannon', 'cannon', true));

  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const move = findMove(board, 'red', [5, 0], [5, 1]);
  const trace = singleTrace(state, move);

  assertOk(trace.exchangeNet > 0);
  assertEqual(trace.highRiskNeutralExchange, false);
  assertEqual(trace.hiddenMoverLowValueCapture, false);
  assertEqual(trace.prematureHiddenMajorLowHiddenCapture, false);
  assertEqual(trace.hasClearGain, true);
  assertEqual(trace.safeCapturePriority, true);
  assertEqual(trace.safeRevealedMajorCapture, true);
  assertEqual(trace.priorityTier, 2);
  assertEqual(trace.materialCaptureRank, 'cannonHorse');
});

test('left edge rook only gives same-side horse pawn-line guard bonus', () => {
  const board = baseHorseGuardBoard();
  place(board, 6, 0, piece('black', 'pawn', 'rook', true));

  const leftTrace = horseGuardTrace(board, [9, 1], [7, 2]);
  const rightTrace = horseGuardTrace(board, [9, 7], [7, 6]);

  assertEqual(leftTrace.edgeRookThreatSide, 'left');
  assertEqual(leftTrace.sameSideEdgeRookHorseGuard, true);
  assertEqual(leftTrace.horsePawnLineGuard, true);
  assertEqual(leftTrace.priorityTier, 4);
  assertEqual(rightTrace.edgeRookThreatSide, 'left');
  assertEqual(rightTrace.sameSideEdgeRookHorseGuard, false);
  assertEqual(rightTrace.horsePawnLineGuard, false);
});

test('right edge rook only gives same-side horse pawn-line guard bonus', () => {
  const board = baseHorseGuardBoard();
  place(board, 6, 8, piece('black', 'pawn', 'rook', true));

  const leftTrace = horseGuardTrace(board, [9, 1], [7, 2]);
  const rightTrace = horseGuardTrace(board, [9, 7], [7, 6]);

  assertEqual(rightTrace.edgeRookThreatSide, 'right');
  assertEqual(rightTrace.sameSideEdgeRookHorseGuard, true);
  assertEqual(rightTrace.horsePawnLineGuard, true);
  assertEqual(leftTrace.edgeRookThreatSide, 'right');
  assertEqual(leftTrace.sameSideEdgeRookHorseGuard, false);
  assertEqual(leftTrace.horsePawnLineGuard, false);
});

test('edge rook attacking edge pawn is not a direct third-seventh pawn-line threat', () => {
  const board = baseHorseGuardBoard();
  place(board, 6, 0, piece('red', 'pawn', 'pawn', false));
  place(board, 3, 0, piece('black', 'pawn', 'rook', true));

  const trace = horseGuardTrace(board, [9, 1], [7, 2]);

  assertEqual(trace.edgeRookThreatSide, 'left');
  assertEqual(trace.directPawnLineRookThreat, false);
  assertEqual(trace.threatenedPawnLineCol, null);
  assertEqual(trace.sameSideEdgeRookHorseGuard, true);
});

test('direct rook attack on third-file pawn only gives left horse guard', () => {
  const board = baseHorseGuardBoard();
  place(board, 6, 2, piece('red', 'pawn', 'pawn', false));
  place(board, 3, 2, piece('black', 'rook', 'rook', true));

  const leftTrace = horseGuardTrace(board, [9, 1], [7, 2]);
  const rightTrace = horseGuardTrace(board, [9, 7], [7, 6]);

  assertEqual(leftTrace.directPawnLineRookThreat, true);
  assertEqual(leftTrace.threatenedPawnLineCol, 2);
  assertEqual(leftTrace.horsePawnLineGuard, true);
  assertEqual(rightTrace.directPawnLineRookThreat, true);
  assertEqual(rightTrace.threatenedPawnLineCol, 2);
  assertEqual(rightTrace.horsePawnLineGuard, false);
});

test('direct rook attack on seventh-file pawn only gives right horse guard', () => {
  const board = baseHorseGuardBoard();
  place(board, 6, 6, piece('red', 'pawn', 'pawn', false));
  place(board, 3, 6, piece('black', 'rook', 'rook', true));

  const leftTrace = horseGuardTrace(board, [9, 1], [7, 2]);
  const rightTrace = horseGuardTrace(board, [9, 7], [7, 6]);

  assertEqual(rightTrace.directPawnLineRookThreat, true);
  assertEqual(rightTrace.threatenedPawnLineCol, 6);
  assertEqual(rightTrace.horsePawnLineGuard, true);
  assertEqual(leftTrace.directPawnLineRookThreat, true);
  assertEqual(leftTrace.threatenedPawnLineCol, 6);
  assertEqual(leftTrace.horsePawnLineGuard, false);
});

test('revealed rook eating low-value elephant with hidden recapture is unsafe', () => {
  const board = baseBoard();
  board[5][4] = null;
  place(board, 4, 4, piece('red', 'pawn', 'pawn', true));
  place(board, 5, 1, piece('black', 'elephant', 'elephant', true));
  place(board, 5, 8, piece('black', 'rook', 'rook', false));

  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const move = findMove(board, 'red', [5, 0], [5, 1]);
  const trace = singleTrace(state, move);

  assertEqual(trace.captureGain, defaultAiWeights.elephantTargetValue);
  assertEqual(trace.moverMaterialValue, defaultAiWeights.pieceValues.rook);
  assertEqual(trace.hiddenMajorRecaptureRisk, true);
  assertEqual(trace.hiddenRecaptureMaterialLoss, 360);
  assertEqual(trace.unsafeHiddenRecaptureExchange, true);
  assertEqual(trace.unsafeHiddenRecaptureExchangePenalty, defaultAiWeights.unsafeHiddenRecaptureExchangePenalty);
  assertEqual(trace.safeCapturePriority, false);
  assertEqual(trace.hasClearGain, false);
  assertEqual(trace.safeRevealedMajorCapture, false);
  assertOk(trace.forcingMoveQuality !== 'productive');
  assertOk(trace.priorityTier !== 2);
  assertEqual(trace.filteredByHigherPriorityTier, false);
});

test('revealed rook eating revealed rook without hidden recapture remains safe', () => {
  const board = baseBoard();
  place(board, 5, 1, piece('black', 'rook', 'rook', true));

  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const move = findMove(board, 'red', [5, 0], [5, 1]);
  const trace = singleTrace(state, move);

  assertEqual(trace.unsafeHiddenRecaptureExchange, false);
  assertEqual(trace.hiddenMajorRecaptureRisk, false);
  assertEqual(trace.safeCapturePriority, true);
  assertEqual(trace.hasClearGain, true);
  assertEqual(trace.safeRevealedMajorCapture, true);
  assertOk(trace.priorityTier === 1 || trace.priorityTier === 2);
  assertEqual(trace.materialCaptureRank, 'rook');
});

test('priority gate filters lower-tier structure when safe capture exists', () => {
  const board = baseHorseGuardBoard();
  place(board, 6, 0, piece('black', 'pawn', 'rook', true));
  place(board, 5, 1, piece('black', 'cannon', 'cannon', true));
  place(board, 5, 0, piece('red', 'rook', 'rook', true));

  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const safeCapture = findMove(board, 'red', [5, 0], [5, 1]);
  const structureMove = findMove(board, 'red', [9, 1], [7, 2]);
  const result = recommendMove(state, [structureMove, safeCapture]);
  assertOk(result.move);
  assertEqual(result.move.from.row, 5);
  assertEqual(result.move.from.col, 0);
  assertOk(result.traces);

  const safeTrace = result.traces.find(t => t.move === safeCapture);
  const structureTrace = result.traces.find(t => t.move === structureMove);
  assertOk(safeTrace);
  assertOk(structureTrace);
  assertOk(safeTrace.priorityTier === 1 || safeTrace.priorityTier === 2);
  assertEqual(safeTrace.bestAvailablePriorityTier, safeTrace.priorityTier);
  assertEqual(safeTrace.filteredByHigherPriorityTier, false);
  assertEqual(structureTrace.priorityTier, 4);
  assertEqual(structureTrace.bestAvailablePriorityTier, safeTrace.priorityTier);
  assertEqual(structureTrace.filteredByHigherPriorityTier, true);
});

test('debug report prints priority gate fields', () => {
  const board = baseBoard();
  place(board, 5, 1, piece('black', 'cannon', 'cannon', true));
  const state: GameState = { board, turn: 'red', history: [], status: 'playing' };
  const move = findMove(board, 'red', [5, 0], [5, 1]);
  const recommendation = recommendMove(state, [move]);
  const report = formatAiDebugReport({ modeName: 'test', state, recommendation });

  assertOk(report.includes('priorityTier'));
  assertOk(report.includes('priorityTierLabel'));
  assertOk(report.includes('prioritySubRank'));
  assertOk(report.includes('bestAvailablePriorityTier'));
  assertOk(report.includes('filteredByHigherPriorityTier'));
  assertOk(report.includes('materialCaptureRank'));
});
