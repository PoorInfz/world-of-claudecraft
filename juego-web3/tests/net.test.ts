import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { type App, createApp } from '../server/app.ts';
import { MemoryStore } from '../server/db/memory_store.ts';
import { Zone } from '../server/zone/zone.ts';
import { defaultAppearance, encodeAppearance } from '../shared/appearance.ts';
import type { ServerMsg } from '../shared/protocol.ts';
import { makeMap } from './helpers.ts';

/** Integracion: servidor real (API + WebSocket) con almacen en memoria. */
let app: App;
let zone: Zone;
let base: string;

beforeAll(async () => {
  zone = new Zone('test', makeMap(40, 40), 3);
  app = await createApp(zone, new MemoryStore(), 0, null, { rateScale: 100 });
  base = `http://localhost:${app.server.port}`;
});
afterAll(async () => {
  await app.close();
});

async function api(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}

async function account(user: string): Promise<string> {
  const r = await api('POST', '/api/cuentas', { usuario: user, clave: 'contrasena1' });
  expect(r.status).toBe(201);
  return r.body.token as string;
}

async function character(
  token: string,
  name: string,
  race: 'humano' | 'orco' = 'humano',
  clase = 'guerrero',
) {
  const r = await api(
    'POST',
    '/api/personajes',
    {
      nombre: name,
      clase,
      apariencia: encodeAppearance(defaultAppearance(race, 'f')),
    },
    token,
  );
  expect(r.status).toBe(201);
  return r.body.personaje as { id: number; faction: string };
}

interface Client {
  ws: WebSocket;
  msgs: ServerMsg[];
  waitFor(pred: (m: ServerMsg) => boolean, ms?: number): Promise<ServerMsg>;
  closed: Promise<void>;
}

function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${app.server.port}/ws`);
    const msgs: ServerMsg[] = [];
    const waiters: { pred: (m: ServerMsg) => boolean; ok: (m: ServerMsg) => void }[] = [];
    const closed = new Promise<void>((ok) => ws.on('close', () => ok()));
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
        closed,
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

async function enter(token: string, char: number): Promise<Client & { id: number }> {
  const c = await connect();
  c.ws.send(JSON.stringify({ t: 'join', token, char }));
  const w = (await c.waitFor((m) => m.t === 'welcome' || m.t === 'reject')) as ServerMsg;
  if (w.t !== 'welcome') throw new Error(`rechazado: ${JSON.stringify(w)}`);
  return Object.assign(c, { id: w.id });
}

describe('API de cuentas y personajes', () => {
  it('registro, duplicado, inicio de sesion y credenciales incorrectas', async () => {
    await account('alba');
    expect(
      (await api('POST', '/api/cuentas', { usuario: 'ALBA', clave: 'otraclave1' })).body,
    ).toEqual({ error: 'usuario_en_uso' });
    expect(
      (await api('POST', '/api/cuentas', { usuario: 'x', clave: 'contrasena1' })).body,
    ).toEqual({ error: 'usuario_invalido' });
    expect((await api('POST', '/api/cuentas', { usuario: 'corta', clave: '123' })).body).toEqual({
      error: 'clave_invalida',
    });
    expect(
      (await api('POST', '/api/sesion', { usuario: 'alba', clave: 'mala-clave' })).status,
    ).toBe(401);
    expect(
      (await api('POST', '/api/sesion', { usuario: 'nadie', clave: 'mala-clave' })).status,
    ).toBe(401);
    const ok = await api('POST', '/api/sesion', { usuario: 'alba', clave: 'contrasena1' });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
  });

  it('sin token no hay personajes', async () => {
    expect((await api('GET', '/api/personajes')).status).toBe(401);
    expect((await api('GET', '/api/personajes', undefined, 'token-falso-123')).status).toBe(401);
  });

  it('crear: la faccion sale de la raza y se valida todo en el servidor', async () => {
    const t = await account('creadora');
    const orc = await character(t, 'Grasha', 'orco');
    expect(orc.faction).toBe('sombra');
    const bad = (apariencia: unknown, nombre = 'Valida', clase = 'mago') =>
      api('POST', '/api/personajes', { nombre, clase, apariencia }, t);
    const good = encodeAppearance(defaultAppearance('humano', 'm'));
    expect((await bad([0, 0, 99, 1, 0, 0, 0, 0])).body).toEqual({ error: 'apariencia_invalida' });
    expect((await bad([0, 0, 0, 7, 0, 0, 0, 0])).body).toEqual({ error: 'apariencia_invalida' }); // moño no disponible para hombre humano
    expect((await bad([9, 0, 0, 1, 0, 0, 0, 0])).body).toEqual({ error: 'apariencia_invalida' });
    expect((await bad(good, 'Mal nombre')).body).toEqual({ error: 'nombre_invalido' });
    expect((await bad(good, 'Valida', 'paladin')).body).toEqual({ error: 'clase_invalida' });
    expect((await bad(good, 'grasha')).body).toEqual({ error: 'nombre_en_uso' });
    const list = await api('GET', '/api/personajes', undefined, t);
    expect(list.body.personajes.map((p: { name: string }) => p.name)).toEqual(['Grasha']);
  });

  it('limite de ranuras por cuenta', async () => {
    const t = await account('coleccionista');
    const names = ['Ana', 'Berta', 'Carla', 'Dora', 'Elena', 'Fina'];
    for (const n of names) await character(t, n);
    const r = await api(
      'POST',
      '/api/personajes',
      {
        nombre: 'Gala',
        clase: 'mago',
        apariencia: encodeAppearance(defaultAppearance('humano', 'f')),
      },
      t,
    );
    expect(r.body).toEqual({ error: 'limite_personajes' });
  });

  it('solo se borran personajes propios', async () => {
    const a = await account('duenaa');
    const b = await account('intrusa');
    const c = await character(a, 'Propia');
    expect((await api('DELETE', `/api/personajes/${c.id}`, undefined, b)).status).toBe(404);
    expect((await api('DELETE', `/api/personajes/${c.id}`, undefined, a)).status).toBe(204);
  });
});

describe('WebSocket con cuentas', () => {
  it('dos jugadores se ven con su apariencia y faccion', async () => {
    const ta = await account('jugadoraa');
    const tb = await account('jugadorb');
    const ca = await character(ta, 'Aurelia', 'humano');
    const cb = await character(tb, 'Bruma', 'orco', 'mago');
    const a = await enter(ta, ca.id);
    const b = await enter(tb, cb.id);
    const seen = await a.waitFor((m) => m.t === 'snap' && !!m.add?.some((e) => e.id === b.id));
    const init = seen.t === 'snap' ? seen.add?.find((e) => e.id === b.id) : undefined;
    expect(init).toMatchObject({ n: 'Bruma', fac: 'sombra', cls: 'mago' });
    expect(init?.ap?.[0]).toBe(1); // orco
    b.ws.send(JSON.stringify({ t: 'move', x: 9.5, y: 5.5 }));
    await a.waitFor((m) => m.t === 'snap' && !!m.upd?.some((u) => u[0] === b.id && u[1] > 6));
    a.ws.close();
    b.ws.close();
    await Promise.all([a.closed, b.closed]);
  });

  it('no se puede usar el personaje de otra cuenta ni entrar dos veces', async () => {
    const ta = await account('celia');
    const tb = await account('dario');
    const c = await character(ta, 'Celia');
    const other = await connect();
    other.ws.send(JSON.stringify({ t: 'join', token: tb, char: c.id }));
    expect(await other.waitFor((m) => m.t === 'reject')).toEqual({
      t: 'reject',
      code: 'personaje_no_encontrado',
    });
    const first = await enter(ta, c.id);
    const second = await connect();
    second.ws.send(JSON.stringify({ t: 'join', token: ta, char: c.id }));
    expect(await second.waitFor((m) => m.t === 'reject')).toEqual({
      t: 'reject',
      code: 'personaje_en_uso',
    });
    const bad = await connect();
    bad.ws.send(JSON.stringify({ t: 'join', token: 'no-es-un-token', char: c.id }));
    expect(await bad.waitFor((m) => m.t === 'reject')).toEqual({
      t: 'reject',
      code: 'sesion_invalida',
    });
    for (const c2 of [first, second, other, bad]) c2.ws.close();
  });

  it('la posicion, el oro y la bolsa se guardan al salir y se recuperan al volver', async () => {
    const t = await account('persistente');
    const c = await character(t, 'Tenaz');
    const s1 = await enter(t, c.id);
    // Ganancias dentro del servidor (en el juego vienen del botin).
    const ent = zone.entities.get(s1.id);
    if (ent?.kind !== 'player') throw new Error('sin jugador');
    ent.gold = 1234;
    ent.inv = [{ item: 'colmillo_lobo', qty: 3 }];
    ent.invDirty = true;
    s1.ws.send(JSON.stringify({ t: 'move', x: 9.5, y: 7.5 }));
    await s1.waitFor(
      (m) => m.t === 'snap' && !!m.upd?.some((u) => u[0] === s1.id && u[1] === 9.5 && u[2] === 7.5),
      5000,
    );
    s1.ws.close();
    await s1.closed;
    // Reconexion inmediata: debe esperar al guardado y cargar la nueva posicion.
    const s2 = await enter(t, c.id);
    const w = s2.msgs.find((m) => m.t === 'welcome');
    expect(w).toMatchObject({ x: 9.5, y: 7.5 });
    const me = await s2.waitFor((m) => m.t === 'snap' && !!m.me?.inv);
    expect(me.t === 'snap' && me.me).toMatchObject({
      gold: 1234,
      inv: [{ item: 'colmillo_lobo', qty: 3 }],
    });
    s2.ws.close();
    await s2.closed;
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

describe('limite de peticiones', () => {
  it('corta tras superar el limite por minuto y se recupera al minuto', async () => {
    const { RateLimiter } = await import('../server/http/router.ts');
    const l = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(l.allow('ip:POST:/api/cuentas', 10, t0 + i)).toBe(true);
    expect(l.allow('ip:POST:/api/cuentas', 10, t0 + 20)).toBe(false);
    expect(l.allow('otra-ip:POST:/api/cuentas', 10, t0 + 20)).toBe(true);
    expect(l.allow('ip:POST:/api/cuentas', 10, t0 + 60_001)).toBe(true);
  });
});
