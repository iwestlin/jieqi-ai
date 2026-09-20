import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const enginePath = fileURLToPath(
  new URL('./Pikafish-jieqi_old/src/PikaJieQi', import.meta.url),
);
const API_PATH = '/api/pikafish-move';

type SearchRequest = {
  fen: string;
  movetime?: number;
};

type SearchResult = {
  bestMove: string;
  score?: number;
  mateIn?: number;
  depth?: number;
  nodes?: number;
};

class UciEngine {
  private process: ChildProcessWithoutNullStreams | null = null;
  private chain = Promise.resolve();
  private buffer = '';

  private async start() {
    if (this.process) return;

    const child = spawn(enginePath, [], {
      cwd: path.dirname(enginePath),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    this.buffer = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', data => console.error(`[Pikafish stderr] ${data}`));
    child.on('exit', () => {
      if (this.process === child) this.process = null;
    });
    child.on('error', error => {
      console.error('[Pikafish] failed to start:', error);
      if (this.process === child) this.process = null;
    });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => {
      this.buffer += data;
    });

    await this.send('uci', line => line.startsWith('uciok'));
    await this.send('isready', line => line.startsWith('readyok'));
  }

  private send(command: string, isDone: (line: string) => boolean, timeoutMs = 10_000) {
    const engine = this.process;
    if (!engine) throw new Error('Pikafish process is not running');

    return new Promise<void>((resolve, reject) => {
      const previousLength = this.buffer.length;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for: ${command}`));
      }, timeoutMs);

      const onOutput = () => {
        const output = this.buffer.slice(previousLength);
        const newLines = output.split('\n').slice(0, -1);
        if (newLines.some(isDone)) {
          cleanup();
          resolve();
        }
      };

      function cleanup() {
        clearTimeout(timer);
        engine.stdout.off('data', onOutput);
      }

      engine.stdout.on('data', onOutput);
      engine.stdin.write(`${command}\n`);
    });
  }

  private async search(request: SearchRequest): Promise<SearchResult> {
    await this.start();
    if (!this.process) throw new Error('Pikafish process exited');

    const engine = this.process;
    const movetime = Math.min(Math.max(request.movetime ?? 800, 80), 10_000);
    this.buffer = '';
    engine.stdin.write(`position fen ${request.fen}\n`);
    engine.stdin.write(`go movetime ${movetime}\n`);

    return await new Promise<SearchResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        engine.stdout.off('data', onOutput);
        engine.stdin.write('stop\n');
        reject(new Error('Pikafish search timed out'));
      }, movetime + 15_000);

      const onOutput = (data: string) => {
        const result: SearchResult = {
          bestMove: '',
        };
        let foundBestMove = false;

        for (const rawLine of data.split('\n')) {
          const line = rawLine.trim();
          const infoMatch = line.match(/^info .*?\bscore cp (-?\d+)/);
          const mateMatch = line.match(/^info .*?\bscore mate (-?\d+)/);
          const depthMatch = line.match(/^info .*?\bdepth (\d+)/);
          const nodesMatch = line.match(/^info .*?\bnodes (\d+)/);

          if (infoMatch) {
            result.score = Number(infoMatch[1]);
            result.mateIn = undefined;
          }
          if (mateMatch) {
            result.mateIn = Number(mateMatch[1]);
            result.score = Number(mateMatch[1]) > 0 ? 10_000 : -10_000;
          }
          if (depthMatch) result.depth = Number(depthMatch[1]);
          if (nodesMatch) result.nodes = Number(nodesMatch[1]);

          if (line.startsWith('bestmove')) {
            result.bestMove = line.split(/\s+/)[1] ?? '';
            foundBestMove = true;
          }
        }

        if (foundBestMove) {
          clearTimeout(timer);
          engine.stdout.off('data', onOutput);
          if (!result.bestMove || result.bestMove === '(none)') {
            reject(new Error('Pikafish found no legal move'));
            return;
          }
          resolve(result);
        }
      };

      engine.stdout.on('data', onOutput);
    });
  }

  request(request: SearchRequest) {
    const next = this.chain.then(() => this.search(request));
    this.chain = next.catch(() => undefined);
    return next;
  }

  kill() {
    this.process?.kill();
    this.process = null;
  }
}

const engine = new UciEngine();

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<SearchRequest> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as SearchRequest;
  if (typeof body.fen !== 'string' || !body.fen.trim()) {
    throw new Error('A non-empty fen is required');
  }
  return {
    fen: body.fen,
    movetime: typeof body.movetime === 'number' ? body.movetime : undefined,
  };
}

function pikafishApiPlugin(): Plugin {
  const middleware = async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    try {
      const request = await readJsonBody(req);
      const result = await engine.request(request);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : 'Pikafish engine unavailable',
      }));
    }
  };

  return {
    name: 'pikafish-uci-api',
    configureServer(server) {
      server.httpServer?.once('close', () => engine.kill());
      server.middlewares.use(API_PATH, (req, res) => {
        void middleware(req, res);
      });
    },
    configurePreviewServer(server) {
      server.httpServer?.once('close', () => engine.kill());
      server.middlewares.use(API_PATH, (req, res) => {
        void middleware(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pikafishApiPlugin()],
});
