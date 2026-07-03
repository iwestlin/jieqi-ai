import { recommendMove } from '../src/ai/simpleAi';
import { defaultAiWeights } from '../src/ai/aiWeights';
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
  assertEqual(trace.safeCapturePriority, false);
  assertEqual(trace.safeRevealedMajorCapture, false);
  assertOk(trace.forcingMoveQuality !== 'productive');
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
  assertEqual(trace.safeCapturePriority, true);
  assertEqual(trace.safeRevealedMajorCapture, true);
});
