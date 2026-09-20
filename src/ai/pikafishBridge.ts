import type { GameState, PieceType, Position, Side } from '../types/chess';

const initialPool: Record<Side, Record<PieceType, number>> = {
  red: {
    king: 1,
    advisor: 2,
    elephant: 2,
    rook: 2,
    horse: 2,
    cannon: 2,
    pawn: 5,
  },
  black: {
    king: 1,
    advisor: 2,
    elephant: 2,
    rook: 2,
    horse: 2,
    cannon: 2,
    pawn: 5,
  },
};

const pieceChars: Record<PieceType, string> = {
  king: 'K',
  advisor: 'A',
  elephant: 'B',
  rook: 'R',
  horse: 'N',
  cannon: 'C',
  pawn: 'P',
};

function addCount(
  counts: Record<PieceType, number>,
  side: Side,
  type: PieceType,
  delta: number,
) {
  counts[type] = Math.max(0, counts[type] + delta);
}

function remainingPool(state: GameState): Record<Side, Record<PieceType, number>> {
  const pool = {
    red: { ...initialPool.red },
    black: { ...initialPool.black },
  };

  for (const row of state.board) {
    for (const piece of row) {
      if (piece?.revealed) addCount(pool[piece.side], piece.side, piece.realType, -1);
    }
  }

  for (const move of state.history) {
    if (move.captured) {
      addCount(
        pool[move.captured.side],
        move.captured.side,
        move.captured.realType,
        -1,
      );
    }
  }

  return pool;
}

function poolToFen(pool: Record<Side, Record<PieceType, number>>): string {
  const types: PieceType[] = ['rook', 'advisor', 'cannon', 'pawn', 'horse', 'elephant'];
  let result = '';
  for (const side of ['red', 'black'] as Side[]) {
    for (const type of types) {
      const count = pool[side][type];
      if (count > 0) {
        result += side === 'red'
          ? `${pieceChars[type]}${count}`
          : `${pieceChars[type].toLowerCase()}${count}`;
      }
    }
  }
  return result;
}

export function gameStateToPikafishFen(state: GameState): string {
  const placement = state.board.map(row => {
    let fen = '';
    let emptyCount = 0;
    for (const piece of row) {
      if (!piece) {
        emptyCount += 1;
        continue;
      }
      if (emptyCount) {
        fen += String(emptyCount);
        emptyCount = 0;
      }
      const char = pieceChars[piece.revealed ? piece.realType : piece.originalType];
      fen += piece.side === 'red' ? char : char.toLowerCase();
      if (!piece.revealed) {
        fen = fen.slice(0, -1) + (piece.side === 'red' ? 'X' : 'x');
      }
    }
    if (emptyCount) fen += String(emptyCount);
    return fen;
  }).join('/');

  return [
    placement,
    state.turn === 'red' ? 'w' : 'b',
    poolToFen(remainingPool(state)),
    0,
    1,
  ].join(' ');
}

export function pikafishMoveToPosition(move: string): { from: Position; to: Position } | null {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(move)) return null;

  const squareToPosition = (square: string): Position => ({
    col: square.charCodeAt(0) - 97,
    row: 9 - Number(square[1]),
  });

  return {
    from: squareToPosition(move.slice(0, 2)),
    to: squareToPosition(move.slice(2, 4)),
  };
}

export type PikafishSearchResult = {
  bestMove: string;
  score?: number;
  mateIn?: number;
  depth?: number;
  nodes?: number;
};

export async function requestPikafishMove(
  state: GameState,
  options: { movetime?: number; signal?: AbortSignal } = {},
): Promise<PikafishSearchResult> {
  const response = await fetch('/api/pikafish-move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: gameStateToPikafishFen(state),
      movetime: options.movetime ?? 800,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }) as { error?: string });
    throw new Error(body.error ?? `Pikafish API error ${response.status}`);
  }

  return await response.json() as PikafishSearchResult;
}
