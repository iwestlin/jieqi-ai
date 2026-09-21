import type { GameState, PieceType, Position, Side } from '../types/chess';
import { PikafishEngine } from './pikafishEngine';

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

let engine: PikafishEngine | null = null;
let engineReady: Promise<void> | null = null;
let searchQueue: Promise<unknown> = Promise.resolve();

function getEngine(): PikafishEngine {
  if (!engine) {
    const pikafish = new PikafishEngine();
    engine = pikafish;
    engineReady = pikafish.start({ threads: 1, hashMB: 48 }).then(() => {
      pikafish.send('uci');
      return pikafish.waitFor(message => message.line?.includes('uciok') ?? false);
    }).then(() => {
      pikafish.send('isready');
      return pikafish.waitFor(message => message.line === 'readyok');
    }).then(() => undefined).catch(error => {
      engine = null;
      engineReady = null;
      console.error('[Pikafish] engine initialization failed:', error);
      throw error;
    });
  }
  return engine;
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export async function requestPikafishMove(
  state: GameState,
  options: { movetime?: number; signal?: AbortSignal } = {},
): Promise<PikafishSearchResult> {
  const pikafish = getEngine();
  const movetime = Math.min(Math.max(options.movetime ?? 800, 80), 10_000);
  if (!engineReady) throw new Error('Pikafish engine is unavailable');
  const previousQueue = searchQueue;

  const search = (previousQueue ?? Promise.resolve()).then(async () => {
    if (options.signal?.aborted) throw abortError();
    await engineReady;

    const result: PikafishSearchResult = { bestMove: '' };
    const unsubscribe = pikafish.onOutput((message: { type: string; line?: string; error?: string }) => {
      if (message.type !== 'output') return;
      const line = message.line?.trim();
      if (!line) return;
      const scoreMatch = line.match(/^info .*?\bscore cp (-?\d+)/);
      const mateMatch = line.match(/^info .*?\bscore mate (-?\d+)/);
      const depthMatch = line.match(/^info .*?\bdepth (\d+)/);
      const nodesMatch = line.match(/^info .*?\bnodes (\d+)/);

      if (scoreMatch) {
        result.score = Number(scoreMatch[1]);
        result.mateIn = undefined;
      }
      if (mateMatch) {
        result.mateIn = Number(mateMatch[1]);
        result.score = Number(mateMatch[1]) > 0 ? 10_000 : -10_000;
      }
      if (depthMatch) result.depth = Number(depthMatch[1]);
      if (nodesMatch) result.nodes = Number(nodesMatch[1]);
    });

    try {
      pikafish.send(`position fen ${gameStateToPikafishFen(state)}`);
      pikafish.send(`go movetime ${movetime}`);
      const bestMoveMessage = await Promise.race([
        pikafish.waitFor(message => message.line?.startsWith('bestmove ') ?? false, movetime + 15_000),
        new Promise<never>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            pikafish.stop();
            reject(abortError());
          }, { once: true });
        }),
      ]);

      result.bestMove = bestMoveMessage.line?.split(/\s+/)[1] ?? '';
      if (!result.bestMove || result.bestMove === '(none)') {
        throw new Error('Pikafish found no legal move');
      }
      return result;
    } catch (error) {
      pikafish.stop();
      await pikafish.waitFor(
        message => message.line?.startsWith('bestmove ') ?? false,
        3_000,
      ).catch(() => undefined);
      throw error;
    } finally {
      unsubscribe();
    }
  });

  searchQueue = search.then(
    () => undefined,
    () => undefined,
  );
  return search;
}
