import { AOI_CELL } from '../../shared/constants.ts';
import type { Entity } from './entities.ts';

/**
 * Rejilla espacial por celdas para el area de interes (AOI) y para las
 * busquedas de proximidad (agresion, areas de efecto).
 */
export class SpatialGrid {
  private cells = new Map<number, Set<Entity>>();
  private readonly cols: number;

  constructor(width: number) {
    this.cols = Math.ceil(width / AOI_CELL) + 1;
  }

  cellOf(x: number, y: number): number {
    return Math.floor(y / AOI_CELL) * this.cols + Math.floor(x / AOI_CELL);
  }

  /** Inserta o mueve la entidad a su celda actual. */
  update(e: Entity): void {
    const c = this.cellOf(e.x, e.y);
    if (c === e.cell) return;
    if (e.cell >= 0) this.cells.get(e.cell)?.delete(e);
    let set = this.cells.get(c);
    if (!set) {
      set = new Set();
      this.cells.set(c, set);
    }
    set.add(e);
    e.cell = c;
  }

  remove(e: Entity): void {
    if (e.cell >= 0) this.cells.get(e.cell)?.delete(e);
    e.cell = -1;
  }

  /** Entidades en las celdas alrededor de (x, y) con un radio en celdas. */
  *around(x: number, y: number, cellRadius: number): Generator<Entity> {
    const cx = Math.floor(x / AOI_CELL);
    const cy = Math.floor(y / AOI_CELL);
    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const set = this.cells.get((cy + dy) * this.cols + (cx + dx));
        if (set) yield* set;
      }
    }
  }

  /** Entidades dentro de un radio exacto (en baldosas). */
  *within(x: number, y: number, radius: number): Generator<Entity> {
    const cr = Math.ceil(radius / AOI_CELL);
    for (const e of this.around(x, y, cr)) {
      if (Math.hypot(e.x - x, e.y - y) <= radius) yield e;
    }
  }
}
