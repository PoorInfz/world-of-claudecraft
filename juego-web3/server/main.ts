import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '../shared/constants.ts';
import { START_ZONE, ZONES } from '../shared/data/zones.ts';
import { parseTiledMap, type TiledMap } from '../shared/map.ts';
import { startServer } from './net/server.ts';
import { Zone } from './zone/zone.ts';

/**
 * Arranca UN proceso de zona. En fases posteriores habra un proceso por zona
 * o instancia y un servicio de pasarela que transfiere al jugador entre ellos.
 */
const here = dirname(fileURLToPath(import.meta.url));
const zoneId = process.env.ZONE ?? START_ZONE;
const def = ZONES[zoneId];
if (!def) throw new Error(`Zona desconocida: ${zoneId}`);

const mapJson = JSON.parse(readFileSync(join(here, '..', 'maps', def.map), 'utf8')) as TiledMap;
const zone = new Zone(
  zoneId,
  parseTiledMap(mapJson),
  Number(process.env.SEED ?? Date.now() % 2147483647),
);
const port = Number(process.env.PORT ?? DEFAULT_PORT);
const staticDir = process.env.NODE_ENV === 'production' ? join(here, '..', 'dist', 'client') : null;

const srv = await startServer(zone, port, staticDir);
console.log(`[zona ${def.name}] escuchando en http://localhost:${srv.port} (ws /ws)`);
