/**
 * Catalogo de baldosas del tileset de placeholders. El indice es el id local
 * de Tiled (gid - firstgid). Si se sustituye por un tileset real, basta con
 * mantener estos indices o remapearlos aqui.
 */
export const TILE = {
  hierba: 0,
  hierba2: 1,
  hierba_flores: 2,
  tierra: 3,
  piedra: 4,
  agua: 5,
  arena: 6,
  hierba_oscura: 7,
  pino: 8,
  roble: 9,
  roca: 10,
  arbusto: 11,
  casa: 12,
  columna: 13,
  tienda: 14,
  hoguera: 15,
  bloqueo: 16,
  lapida: 17,
} as const;

export const TILE_COUNT = 18;

/** Baldosas de suelo que por si mismas bloquean el paso. */
export const BLOCKING_GROUND: ReadonlySet<number> = new Set([TILE.agua]);
