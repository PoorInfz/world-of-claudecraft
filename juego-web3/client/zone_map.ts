import valleAlba from '../maps/valle_alba.tmj?raw';
import { ZONES } from '../shared/data/zones.ts';
import { type MapData, parseTiledMap, type TiledMap } from '../shared/map.ts';

/** Mapas incluidos en el cliente (el mismo .tmj que lee el servidor). */
const RAW: Record<string, string> = { 'valle_alba.tmj': valleAlba };
const cache = new Map<string, MapData>();

export function loadZoneMap(zoneId: string): MapData {
  const hit = cache.get(zoneId);
  if (hit) return hit;
  const def = ZONES[zoneId];
  const raw = def ? RAW[def.map] : undefined;
  if (!raw) throw new Error(`Mapa desconocido: ${zoneId}`);
  const map = parseTiledMap(JSON.parse(raw) as TiledMap);
  cache.set(zoneId, map);
  return map;
}
