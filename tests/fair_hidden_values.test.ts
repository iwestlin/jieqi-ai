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
