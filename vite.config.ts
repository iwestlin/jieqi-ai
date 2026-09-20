import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import pikafishServer from './server/pikafish-server.js';

const { API_PATH, createPikafishService } = pikafishServer;
const pikafishService = createPikafishService();

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
      server.httpServer?.once('close', () => pikafishService.engine.kill());
      server.middlewares.use(API_PATH, (req, res) => {
        void pikafishService.requestHandler(req, res);
      });
    },
    configurePreviewServer(server) {
      server.httpServer?.once('close', () => pikafishService.engine.kill());
      server.middlewares.use(API_PATH, (req, res) => {
        void pikafishService.requestHandler(req, res);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), pikafishApiPlugin()],
});
