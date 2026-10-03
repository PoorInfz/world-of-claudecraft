import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '../shared/constants.ts';
import { START_ZONE, ZONES } from '../shared/data/zones.ts';
import { parseTiledMap, type TiledMap } from '../shared/map.ts';
import { createApp } from './app.ts';
import { MemoryStore } from './db/memory_store.ts';
import { PgStore } from './db/pg_store.ts';
import type { Store } from './db/store.ts';
import { Zone } from './zone/zone.ts';

/**
 * Arranca UN proceso de zona. Con DATABASE_URL usa PostgreSQL; sin ella usa
 * un almacen en memoria (solo para desarrollo: se pierde al reiniciar).
 */
const here = dirname(fileURLToPath(import.meta.url));
const zoneId = process.env.ZONE ?? START_ZONE;
const def = ZONES[zoneId];
if (!def) throw new Error(`Zona desconocida: ${zoneId}`);

let store: Store;
if (process.env.DATABASE_URL) {
  store = new PgStore(process.env.DATABASE_URL);
} else if (process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL es obligatoria en produccion');
} else {
  console.warn(
    '[aviso] Sin DATABASE_URL: cuentas y personajes en memoria (se pierden al reiniciar).',
  );
  store = new MemoryStore();
}

const mapJson = JSON.parse(readFileSync(join(here, '..', 'maps', def.map), 'utf8')) as TiledMap;
const zone = new Zone(
  zoneId,
  parseTiledMap(mapJson),
  Number(process.env.SEED ?? Date.now() % 2147483647),
);
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const staticDir = process.env.NODE_ENV === 'production' ? join(here, '..', 'dist', 'client') : null;

const app = await createApp(zone, store, port, staticDir);
console.log(
  `[zona ${def.name}] escuchando en http://localhost:${app.server.port} (ws /ws, api /api)`,
);

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (stopping) return;
    stopping = true;
    console.log('[zona] guardando personajes y cerrando...');
    app.close().then(
      () => process.exit(0),
      (e) => {
        console.error(e);
        process.exit(1);
      },
    );
  });
}
