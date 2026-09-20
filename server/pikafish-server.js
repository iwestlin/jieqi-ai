'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const API_PATH = '/api/pikafish-move';
const DEFAULT_ENGINE_PATH = path.resolve(__dirname, '../Pikafish-jieqi_old/src/PikaJieQi');
const DEFAULT_HOST = process.env.PIKAFISH_HOST || process.env.HOST || '127.0.0.1';
const DEFAULT_PORT = Number(process.env.PIKAFISH_PORT || process.env.PORT || 8787);

class UciEngine {
  constructor(enginePath = process.env.PIKAFISH_ENGINE || DEFAULT_ENGINE_PATH) {
    this.enginePath = enginePath;
    this.process = null;
    this.buffer = '';
    this.chain = Promise.resolve();
  }

  async start() {
    if (this.process) return;

    const child = spawn(this.enginePath, [], {
      cwd: path.dirname(this.enginePath),
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

  send(command, isDone, timeoutMs = 10_000) {
    const engine = this.process;
    if (!engine) throw new Error('Pikafish process is not running');

    return new Promise((resolve, reject) => {
      const previousLength = this.buffer.length;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for: ${command}`));
      }, timeoutMs);

      const onOutput = () => {
        const output = this.buffer.slice(previousLength);
        if (output.split('\n').some(isDone)) {
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

  async search(request) {
    await this.start();
    if (!this.process) throw new Error('Pikafish process exited');

    const engine = this.process;
    const movetime = Math.min(Math.max(request.movetime ?? 800, 80), 10_000);
    this.buffer = '';
    engine.stdin.write(`position fen ${request.fen}\n`);
    engine.stdin.write(`go movetime ${movetime}\n`);

    return await new Promise((resolve, reject) => {
      const result = {
        bestMove: '',
      };
      const timer = setTimeout(() => {
        engine.stdout.off('data', onOutput);
        engine.stdin.write('stop\n');
        reject(new Error('Pikafish search timed out'));
      }, movetime + 15_000);

      const onOutput = data => {
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

        if (!foundBestMove) return;

        clearTimeout(timer);
        engine.stdout.off('data', onOutput);
        if (!result.bestMove || result.bestMove === '(none)') {
          reject(new Error('Pikafish found no legal move'));
          return;
        }
        resolve(result);
      };

      engine.stdout.on('data', onOutput);
    });
  }

  request(request) {
    const next = this.chain.then(() => this.search(request));
    this.chain = next.catch(() => undefined);
    return next;
  }

  kill() {
    this.process?.kill();
    this.process = null;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('Request body is too large');
    chunks.push(buffer);
  }

  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if (typeof body.fen !== 'string' || !body.fen.trim()) {
    throw new Error('A non-empty fen is required');
  }

  return {
    fen: body.fen,
    movetime: typeof body.movetime === 'number' ? body.movetime : undefined,
  };
}

function applyCors(res) {
  const origin = process.env.PIKAFISH_ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function createPikafishService(options = {}) {
  const engine = options.engine || new UciEngine(options.enginePath);

  async function requestHandler(req, res) {
    applyCors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      if (req.method !== 'POST') throw new Error('Method not allowed');
      const request = await readJsonBody(req);
      const result = await engine.request(request);
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pikafish engine unavailable';
      sendJson(res, 503, { error: message });
    }
  }

  return {
    engine,
    requestHandler,
  };
}

function createPikafishServer(options = {}) {
  const service = createPikafishService(options);
  const server = http.createServer(async (req, res) => {
    applyCors(res);
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;

    if (req.method === 'GET' && pathname === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname !== API_PATH) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    await service.requestHandler(req, res);
  });

  server.on('close', () => service.engine.kill());
  return { server, service };
}

function startPikafishServer(options = {}) {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const { server, service } = createPikafishServer(options);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        server,
        service,
        host,
        port,
      });
    });
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === '--host' && value) {
      options.host = value;
      index += 1;
    } else if (key === '--port' && value) {
      options.port = Number(value);
      index += 1;
    } else if (key === '--engine' && value) {
      options.enginePath = path.resolve(value);
      index += 1;
    }
  }
  return options;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  startPikafishServer(options)
    .then(({ server, service, host, port }) => {
      console.log(`[Pikafish API] listening on http://${host}:${port}${API_PATH}`);
      const shutdown = () => {
        service.engine.kill();
        server.close(() => process.exit(0));
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch(error => {
      console.error('[Pikafish API] failed to start:', error);
      process.exitCode = 1;
    });
}

module.exports = {
  API_PATH,
  DEFAULT_ENGINE_PATH,
  UciEngine,
  createPikafishService,
  createPikafishServer,
  startPikafishServer,
};
