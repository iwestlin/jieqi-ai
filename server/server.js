'use strict';

const http = require('node:http');
const { createReadStream } = require('node:fs');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const path = require('node:path');

const API_PATH = '/api/pikafish-move';
const DEFAULT_ENGINE_PATH = path.resolve(__dirname, 'PikaJieQi');
const DEFAULT_HOST = process.env.PIKAFISH_HOST || process.env.HOST || '0.0.0.0';
const DEFAULT_PORT = Number(process.env.PIKAFISH_PORT || process.env.PORT || 8787);
const DEFAULT_RATE_LIMIT = Number(process.env.PIKAFISH_RATE_LIMIT || 60);
const DEFAULT_RATE_INTERVAL_MS = Number(process.env.PIKAFISH_RATE_INTERVAL_MS || 60_000);
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

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

class IpRateLimiter {
  constructor(limit = DEFAULT_RATE_LIMIT, intervalMs = DEFAULT_RATE_INTERVAL_MS) {
    this.limit = limit;
    this.intervalMs = intervalMs;
    this.requestsByIp = new Map();
    this.nextCleanupAt = 0;
  }

  check(ip) {
    if (this.limit <= 0) return true;

    const now = Date.now();
    if (now >= this.nextCleanupAt) {
      this.cleanup(now);
      this.nextCleanupAt = now + this.intervalMs;
    }

    const requests = (this.requestsByIp.get(ip) || []).filter(
      timestamp => timestamp > now - this.intervalMs,
    );
    if (requests.length >= this.limit) {
      this.requestsByIp.set(ip, requests);
      return false;
    }

    requests.push(now);
    this.requestsByIp.set(ip, requests);
    return true;
  }

  cleanup(now) {
    const cutoff = now - this.intervalMs;
    for (const [ip, requests] of this.requestsByIp) {
      const activeRequests = requests.filter(timestamp => timestamp > cutoff);
      if (activeRequests.length) {
        this.requestsByIp.set(ip, activeRequests);
      } else {
        this.requestsByIp.delete(ip);
      }
    }
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

async function sendStaticFile(res, filePath, method) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) throw new Error('Not found');

  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Cache-Control', 'no-cache');

  if (method === 'HEAD') {
    res.end();
    return;
  }

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    res.on('finish', resolve);
    stream.pipe(res);
  });
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: 'Invalid path' });
    return true;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.slice(1);
  const filePath = path.normalize(path.join(PUBLIC_DIR, relativePath));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return true;
  }

  try {
    await sendStaticFile(res, filePath, req.method);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(res, 404, { error: 'Not found' });
    } else if (error.code === 'EISDIR' || error.message === 'Not found') {
      sendJson(res, 404, { error: 'Not found' });
    } else {
      sendJson(res, 500, { error: 'Unable to read file' });
    }
  }

  return true;
}

function getRequestIp(req) {
  const realIpValues = req.headers['x-real-ip'];
  if (Array.isArray(realIpValues) && realIpValues.length) {
    const realIp = realIpValues[0].trim();
    if (realIp) return realIp;
  } else if (typeof realIpValues === 'string' && realIpValues.trim()) {
    return realIpValues.trim();
  }

  return req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(req, res, rateLimiter) {
  if (rateLimiter.check(getRequestIp(req))) return true;

  res.setHeader('Retry-After', Math.ceil(rateLimiter.intervalMs / 1000));
  sendJson(res, 429, { error: 'Too many requests' });
  return false;
}

function logRequest(req, res, pathname, startedAt) {
  res.once('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.info(
      `[request] ${req.method} ${pathname} ${res.statusCode} ${elapsedMs.toFixed(1)}ms ${getRequestIp(req)}`,
    );
  });
}

function createPikafishService(options = {}) {
  const engine = options.engine || new UciEngine(options.enginePath);
  const rateLimiter = options.rateLimiter || new IpRateLimiter();

  async function requestHandler(req, res) {
    applyCors(res);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    try {
      if (req.method !== 'POST') throw new Error('Method not allowed');
      if (!checkRateLimit(req, res, rateLimiter)) return;
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
    rateLimiter,
  };
}

function createPikafishServer(options = {}) {
  const service = createPikafishService(options);
  const { rateLimiter } = service;
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    logRequest(req, res, pathname, process.hrtime.bigint());

    if (req.method === 'GET' && pathname === '/healthz') {
      applyCors(res);
      if (!checkRateLimit(req, res, rateLimiter)) return;
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname !== API_PATH) {
      await serveStatic(req, res, pathname);
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
      console.log(`[Pikafish API] listening on http://${host}:${port}`);
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
  IpRateLimiter,
  createPikafishService,
  createPikafishServer,
  startPikafishServer,
  serveStatic,
  logRequest,
};
