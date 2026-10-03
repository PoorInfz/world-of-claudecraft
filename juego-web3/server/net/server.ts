import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { TICK_RATE, WS_PATH } from '../../shared/constants.ts';
import { createRouter, type Route } from '../http/router.ts';
import { Session, type SessionDeps } from './session.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.tmj': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export interface RunningServer {
  http: Server;
  port: number;
  close(): Promise<void>;
}

/**
 * Proceso de zona: HTTP (estaticos del cliente compilado + /salud) y
 * WebSocket del juego, con el bucle de simulacion a TICK_RATE Hz.
 */
export function startServer(
  deps: SessionDeps,
  routes: Route[],
  port: number,
  staticDir: string | null,
  rateScale = 1,
): Promise<RunningServer> {
  const { zone } = deps;
  const api = createRouter(routes, rateScale);
  const root = staticDir && existsSync(staticDir) ? resolve(staticDir) : null;
  const http = createServer(async (req, res) => {
    if (await api(req, res)) return;
    const url = (req.url ?? '/').split('?')[0] ?? '/';
    if (url === '/salud') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, zone: zone.id, tick: zone.tick }));
      return;
    }
    if (!root) {
      res.writeHead(404);
      res.end();
      return;
    }
    const rel = normalize(decodeURIComponent(url === '/' ? '/index.html' : url)).replace(
      /^([/\\])+/,
      '',
    );
    const file = resolve(join(root, rel));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server: http, path: WS_PATH, maxPayload: 4096 });
  wss.on('connection', (ws) => new Session(ws, deps));

  // Bucle de paso fijo con compensacion de deriva.
  const stepMs = 1000 / TICK_RATE;
  let next = performance.now();
  let timer: NodeJS.Timeout;
  const loop = (): void => {
    const now = performance.now();
    let steps = 0;
    while (now >= next && steps < 5) {
      zone.step();
      next += stepMs;
      steps++;
    }
    if (steps === 5) next = now + stepMs; // demasiado atrasados: no intentar recuperar
    timer = setTimeout(loop, Math.max(0, next - performance.now()));
  };
  timer = setTimeout(loop, stepMs);

  return new Promise((ok) => {
    http.listen(port, () => {
      const addr = http.address();
      const realPort = typeof addr === 'object' && addr ? addr.port : port;
      ok({
        http,
        port: realPort,
        close: () =>
          new Promise<void>((done) => {
            clearTimeout(timer);
            for (const c of wss.clients) c.terminate();
            wss.close();
            http.close(() => done());
          }),
      });
    });
  });
}
