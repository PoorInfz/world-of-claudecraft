import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { type RunningServer, startServer } from '../server/net/server.ts';
import { Zone } from '../server/zone/zone.ts';
import type { ServerMsg } from '../shared/protocol.ts';
import { makeMap } from './helpers.ts';

/** Prueba de integracion: servidor real, dos clientes WebSocket reales. */
let srv: RunningServer;

beforeAll(async () => {
  srv = await startServer(new Zone('test', makeMap(40, 40), 3), 0, null);
});
afterAll(async () => {
  await srv.close();
});

interface Client {
  ws: WebSocket;
  msgs: ServerMsg[];
  waitFor(pred: (m: ServerMsg) => boolean, ms?: number): Promise<ServerMsg>;
}

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    const msgs: ServerMsg[] = [];
    const waiters: { pred: (m: ServerMsg) => boolean; ok: (m: ServerMsg) => void }[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      msgs.push(m);
      for (const w of [...waiters]) {
        if (w.pred(m)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.ok(m);
        }
      }
    });
    ws.on('open', () =>
      resolve({
        ws,
        msgs,
        waitFor: (pred, ms = 3000) =>
          new Promise((ok, fail) => {
            const found = msgs.find(pred);
            if (found) return ok(found);
            const t = setTimeout(() => fail(new Error('timeout')), ms);
            waiters.push({
              pred,
              ok: (m) => {
                clearTimeout(t);
                ok(m);
              },
            });
          }),
      }),
    );
    ws.on('error', reject);
  });
}

describe('servidor WebSocket', () => {
  it('dos jugadores se ven y ven moverse al otro', async () => {
    const a = await connect();
    const b = await connect();
    a.ws.send(JSON.stringify({ t: 'join', name: 'Alba', cls: 'guerrero', fac: 'luz' }));
    const wa = (await a.waitFor((m) => m.t === 'welcome')) as Extract<ServerMsg, { t: 'welcome' }>;
    b.ws.send(JSON.stringify({ t: 'join', name: 'Bruno', cls: 'mago', fac: 'sombra' }));
    const wb = (await b.waitFor((m) => m.t === 'welcome')) as Extract<ServerMsg, { t: 'welcome' }>;

    await a.waitFor(
      (m) =>
        m.t === 'snap' &&
        !!m.add?.some((e) => e.id === wb.id && e.n === 'Bruno' && e.fac === 'sombra'),
    );
    await b.waitFor(
      (m) => m.t === 'snap' && !!m.add?.some((e) => e.id === wa.id && e.cls === 'guerrero'),
    );

    b.ws.send(JSON.stringify({ t: 'move', x: 9.5, y: 5.5 }));
    await a.waitFor((m) => m.t === 'snap' && !!m.upd?.some((u) => u[0] === wb.id && u[1] > 6));
    a.ws.close();
    b.ws.close();
  });

  it('rechaza nombres duplicados e invalidos', async () => {
    const a = await connect();
    a.ws.send(JSON.stringify({ t: 'join', name: 'Celia', cls: 'guerrero', fac: 'luz' }));
    await a.waitFor((m) => m.t === 'welcome');
    const b = await connect();
    b.ws.send(JSON.stringify({ t: 'join', name: 'celia', cls: 'mago', fac: 'luz' }));
    expect(await b.waitFor((m) => m.t === 'reject')).toEqual({
      t: 'reject',
      code: 'nombre_en_uso',
    });
    b.ws.send(JSON.stringify({ t: 'join', name: 'x', cls: 'mago', fac: 'luz' }));
    await b.waitFor((m) => m.t === 'reject' && m.code === 'nombre_invalido');
    a.ws.close();
    b.ws.close();
  });

  it('ignora ordenes antes de entrar y mensajes malformados', async () => {
    const a = await connect();
    a.ws.send(JSON.stringify({ t: 'move', x: 1, y: 1 }));
    a.ws.send('{malformado');
    a.ws.send(JSON.stringify({ t: 'ping', c: 5 }));
    expect(await a.waitFor((m) => m.t === 'pong')).toMatchObject({ t: 'pong', c: 5 });
    expect(a.msgs.some((m) => m.t === 'snap')).toBe(false);
    a.ws.close();
  });
});
