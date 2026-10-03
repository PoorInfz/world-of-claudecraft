import type { Vec2 } from './iso.ts';
import { isWalkable, type MapData } from './map.ts';

/**
 * A* sobre la rejilla de colision con 8 vecinos (sin cortar esquinas) y
 * suavizado por linea de paso. Determinista: cliente y servidor obtienen la
 * misma ruta para la misma peticion, lo que hace barata la prediccion.
 */

const SQRT2 = Math.SQRT2;
const MAX_EXPANDED = 6000;

/** Hay paso en linea recta entre dos puntos (muestreo cada 0.2 baldosas). */
export function hasLineOfWalk(
  map: MapData,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 0.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (!isWalkable(map, x, y)) return false;
    // Evita colarse en diagonal entre dos baldosas bloqueadas.
    if (!isWalkable(map, x + 0.15, y) && !isWalkable(map, x, y + 0.15)) return false;
  }
  return true;
}

/** Linea de vision: ningun punto del segmento cae en una baldosa opaca. */
export function hasLineOfSight(
  map: MapData,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(ax + (bx - ax) * t);
    const ty = Math.floor(ay + (by - ay) * t);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
    if (map.opaque[ty * map.width + tx]) return false;
  }
  return true;
}

/** Baldosa transitable mas cercana a (x, y) dentro de un radio, o null. */
export function nearestWalkable(map: MapData, x: number, y: number, maxRadius = 4): Vec2 | null {
  if (isWalkable(map, x, y)) return { x, y };
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let r = 1; r <= maxRadius; r++) {
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx + 0.5;
        const ty = cy + dy + 0.5;
        if (!isWalkable(map, tx, ty)) continue;
        const d = Math.hypot(tx - x, ty - y);
        if (d < bestD) {
          bestD = d;
          best = { x: tx, y: ty };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.prio[parent] as number) <= p) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0] as number;
    const lastI = this.items.pop() as number;
    const lastP = this.prio.pop() as number;
    if (this.items.length > 0) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      const n = this.items.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < n && (this.prio[l] as number) < (this.prio[m] as number)) m = l;
        if (r < n && (this.prio[r] as number) < (this.prio[m] as number)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const ti = this.items[a] as number;
    this.items[a] = this.items[b] as number;
    this.items[b] = ti;
    const tp = this.prio[a] as number;
    this.prio[a] = this.prio[b] as number;
    this.prio[b] = tp;
  }
}

/**
 * Ruta desde (sx, sy) hasta (gx, gy). Devuelve la lista de puntos a recorrer
 * (sin incluir el origen) o null si no hay camino. Si el destino esta
 * bloqueado se usa la baldosa libre mas cercana.
 */
export function findPath(
  map: MapData,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): Vec2[] | null {
  const goal = nearestWalkable(map, gx, gy);
  if (!goal) return null;
  if (!isWalkable(map, sx, sy)) {
    const s = nearestWalkable(map, sx, sy, 2);
    if (!s) return null;
    sx = s.x;
    sy = s.y;
  }
  if (hasLineOfWalk(map, sx, sy, goal.x, goal.y)) return [goal];

  const w = map.width;
  const start = Math.floor(sy) * w + Math.floor(sx);
  const target = Math.floor(goal.y) * w + Math.floor(goal.x);
  const gScore = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  const tx = target % w;
  const ty = Math.floor(target / w);
  const h = (i: number): number => {
    const dx = Math.abs((i % w) - tx);
    const dy = Math.abs(Math.floor(i / w) - ty);
    return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
  };
  open.push(start, h(start));
  let expanded = 0;
  let found = false;
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === target) {
      found = true;
      break;
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expanded > MAX_EXPANDED) break;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const g = gScore.get(cur) as number;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWalkable(map, nx, ny)) continue;
        if (
          dx !== 0 &&
          dy !== 0 &&
          (!isWalkable(map, cx + dx, cy) || !isWalkable(map, cx, cy + dy))
        )
          continue;
        const ni = ny * w + nx;
        if (closed.has(ni)) continue;
        const ng = g + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (ng < (gScore.get(ni) ?? Infinity)) {
          gScore.set(ni, ng);
          came.set(ni, cur);
          open.push(ni, ng + h(ni));
        }
      }
    }
  }
  if (!found) return null;

  // Reconstruye la ruta de baldosas.
  const tiles: Vec2[] = [];
  let c: number | undefined = target;
  while (c !== undefined && c !== start) {
    tiles.push({ x: (c % w) + 0.5, y: Math.floor(c / w) + 0.5 });
    c = came.get(c);
  }
  tiles.reverse();
  tiles[tiles.length - 1] = goal;

  // Suavizado: salta a la baldosa mas lejana visible en linea recta.
  const out: Vec2[] = [];
  let ax = sx;
  let ay = sy;
  let i = 0;
  while (i < tiles.length) {
    let j = tiles.length - 1;
    while (j > i) {
      const p = tiles[j] as Vec2;
      if (hasLineOfWalk(map, ax, ay, p.x, p.y)) break;
      j--;
    }
    const p = tiles[j] as Vec2;
    out.push(p);
    ax = p.x;
    ay = p.y;
    i = j + 1;
  }
  return out;
}
