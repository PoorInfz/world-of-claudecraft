import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Enrutador REST minimo: tabla de rutas, cuerpo JSON con limite de tamano,
 * limite de peticiones por IP y errores con codigo estable.
 */

export interface Ctx {
  req: IncomingMessage;
  params: Record<string, string>;
  body: unknown;
  token: string | null;
  ip: string;
}

export interface Reply {
  status: number;
  body?: unknown;
}

export interface Route {
  method: 'GET' | 'POST' | 'DELETE';
  /** Ruta con parametros ":nombre". */
  path: string;
  /** Peticiones por minuto por IP (por defecto 120). */
  rate?: number;
  handler(ctx: Ctx): Promise<Reply>;
}

const MAX_BODY = 4096;

export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();

  allow(key: string, perMinute: number, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || h.reset <= now) {
      this.hits.set(key, { n: 1, reset: now + 60_000 });
      if (this.hits.size > 50_000) this.sweep(now);
      return true;
    }
    h.n++;
    return h.n <= perMinute;
  }

  private sweep(now: number): void {
    for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
  }
}

function match(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/');
  const b = path.split('/');
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const p = a[i] as string;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(b[i] as string);
    else if (p !== b[i]) return null;
  }
  return params;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error('demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (size === 0) return ok(null);
      try {
        ok(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        fail(new Error('json'));
      }
    });
    req.on('error', fail);
  });
}

function send(res: ServerResponse, r: Reply): void {
  res.writeHead(r.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(r.body === undefined ? '' : JSON.stringify(r.body));
}

/** Devuelve true si la peticion era de la API (y ya se respondio). */
/** rateScale multiplica los limites (los tests de integracion usan uno alto). */
export function createRouter(routes: Route[], rateScale = 1) {
  const limiter = new RateLimiter();
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = (req.url ?? '/').split('?')[0] ?? '/';
    if (!url.startsWith('/api/')) return false;
    const ip = req.socket.remoteAddress ?? '?';
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const params = match(r.path, url);
      if (!params) continue;
      if (!limiter.allow(`${ip}:${r.method}:${r.path}`, (r.rate ?? 120) * rateScale)) {
        send(res, { status: 429, body: { error: 'demasiadas_peticiones' } });
        return true;
      }
      let body: unknown = null;
      if (req.method === 'POST') {
        try {
          body = await readBody(req);
        } catch {
          send(res, { status: 400, body: { error: 'peticion_invalida' } });
          return true;
        }
      }
      const auth = req.headers.authorization;
      const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
      try {
        send(res, await r.handler({ req, params, body, token, ip }));
      } catch (e) {
        console.error('[api]', e);
        send(res, { status: 500, body: { error: 'error_interno' } });
      }
      return true;
    }
    send(res, { status: 404, body: { error: 'no_encontrado' } });
    return true;
  };
}
