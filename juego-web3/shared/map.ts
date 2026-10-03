import { TILE_H } from './constants.ts';
import type { SpawnDef } from './data/types.ts';
import { BLOCKING_GROUND } from './tiles.ts';

/**
 * Lectura de mapas de Tiled (.tmj, JSON) isometricos. Cliente y servidor
 * parsean el MISMO archivo, asi que la colision coincide en ambos lados.
 *
 * Capas esperadas:
 *  - "suelo"       (tilelayer)   baldosa de suelo
 *  - "decoracion"  (tilelayer)   arboles, rocas, casas... (se ordenan por y)
 *  - "colision"    (tilelayer)   cualquier baldosa != 0 bloquea el paso
 *  - "objetos"     (objectgroup) puntos: inicio, cementerio y zonas de enemigos
 */

export interface TiledProperty {
  name: string;
  type: string;
  value: string | number | boolean;
}

export interface TiledObject {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  point?: boolean;
  properties?: TiledProperty[];
}

export interface TiledLayer {
  name: string;
  type: 'tilelayer' | 'objectgroup';
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObject[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  orientation: string;
  layers: TiledLayer[];
  tilesets: { firstgid: number; name: string }[];
}

export interface MapData {
  width: number;
  height: number;
  /** Id local de baldosa de suelo, -1 si vacio. */
  ground: Int16Array;
  /** Id local de decoracion, -1 si vacio. */
  deco: Int16Array;
  /** 1 = bloqueado para caminar (incluye agua). */
  blocked: Uint8Array;
  /** 1 = bloquea la linea de vision (capa de colision, no el agua). */
  opaque: Uint8Array;
  /** Punto de inicio; los jugadores aparecen al azar dentro de 'radius'. */
  playerSpawn: { x: number; y: number; radius: number };
  graveyard: { x: number; y: number };
  spawns: SpawnDef[];
}

function prop(o: TiledObject, name: string): TiledProperty['value'] | undefined {
  return o.properties?.find((p) => p.name === name)?.value;
}

export function parseTiledMap(json: TiledMap): MapData {
  if (json.orientation !== 'isometric') throw new Error('El mapa debe ser isometrico');
  const { width, height } = json;
  const n = width * height;
  const firstgid = json.tilesets[0]?.firstgid ?? 1;
  const ground = new Int16Array(n).fill(-1);
  const deco = new Int16Array(n).fill(-1);
  const blocked = new Uint8Array(n);
  const opaque = new Uint8Array(n);
  let playerSpawn = { x: width / 2, y: height / 2, radius: 0 };
  let graveyard: { x: number; y: number } | null = null;
  const spawns: SpawnDef[] = [];

  for (const layer of json.layers) {
    if (layer.type === 'tilelayer' && layer.data) {
      if (layer.data.length !== n) throw new Error(`Capa ${layer.name} con tamano incorrecto`);
      for (let i = 0; i < n; i++) {
        const gid = layer.data[i] ?? 0;
        if (gid === 0) continue;
        const local = gid - firstgid;
        if (layer.name === 'suelo') ground[i] = local;
        else if (layer.name === 'decoracion') deco[i] = local;
        else if (layer.name === 'colision') {
          blocked[i] = 1;
          opaque[i] = 1;
        }
      }
    } else if (layer.type === 'objectgroup' && layer.objects) {
      for (const o of layer.objects) {
        // En mapas isometricos Tiled guarda los objetos en pixeles medidos
        // con el alto de baldosa en ambos ejes.
        const x = o.x / TILE_H;
        const y = o.y / TILE_H;
        const kind = o.type ?? o.class ?? '';
        if (kind === 'inicio') playerSpawn = { x, y, radius: Number(prop(o, 'radio') ?? 0) };
        else if (kind === 'cementerio') graveyard = { x, y };
        else if (kind === 'enemigos') {
          spawns.push({
            mob: String(prop(o, 'mob') ?? ''),
            x,
            y,
            count: Number(prop(o, 'cantidad') ?? 1),
            radius: Number(prop(o, 'radio') ?? 3),
          });
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (BLOCKING_GROUND.has(ground[i] as number)) blocked[i] = 1;
  }
  return {
    width,
    height,
    ground,
    deco,
    blocked,
    opaque,
    playerSpawn,
    graveyard: graveyard ?? playerSpawn,
    spawns,
  };
}

export function isWalkable(map: MapData, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  return map.blocked[ty * map.width + tx] === 0;
}
