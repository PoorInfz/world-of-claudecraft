import { TILE_H, TILE_W } from './constants.ts';

/**
 * Proyeccion isometrica 2:1. El mundo usa coordenadas en baldosas (x, y)
 * con decimales; la pantalla usa pixeles de juego. La baldosa (0, 0) tiene
 * su vertice superior en el origen de pantalla.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export function worldToScreen(x: number, y: number): Vec2 {
  return { x: ((x - y) * TILE_W) / 2, y: ((x + y) * TILE_H) / 2 };
}

export function screenToWorld(sx: number, sy: number): Vec2 {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * 8 direcciones en espacio de PANTALLA, en el orden de las filas de los
 * spritesheets: 0 = sur (hacia la camara), y luego en sentido horario visto
 * desde arriba: SO, O, NO, N, NE, E, SE.
 */
export const DIRECTIONS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Direccion de pantalla (0..7) para un desplazamiento en coordenadas de mundo. */
export function dirFromWorldDelta(dx: number, dy: number, fallback = 0): number {
  const s = worldToScreen(dx, dy);
  if (Math.abs(s.x) < 1e-6 && Math.abs(s.y) < 1e-6) return fallback;
  // atan2 con el eje y de pantalla hacia abajo: 0 rad = este.
  const ang = Math.atan2(s.y, s.x);
  // Este = indice 6; cada octante son 45 grados en sentido horario (+y abajo).
  const oct = Math.round(ang / (Math.PI / 4)); // -4..4, 0 = E, 2 = S
  const table: Record<number, number> = {
    0: 6,
    1: 7,
    2: 0,
    3: 1,
    4: 2,
    [-4]: 2,
    [-3]: 3,
    [-2]: 4,
    [-1]: 5,
  };
  return table[oct] ?? fallback;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
