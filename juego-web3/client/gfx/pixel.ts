import { FOOT_X, FOOT_Y } from './pose.ts';

/** Primitivas de dibujo pixel a pixel sobre canvas 2D (sin antialias). */

export type Ctx = CanvasRenderingContext2D;

export function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, color: string): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  c.fillStyle = color;
  for (;;) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

export function shadow(c: Ctx, w = 14): void {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  const half = w / 2;
  c.fillRect(FOOT_X - half + 2, FOOT_Y - 1, w - 4, 3);
  c.fillRect(FOOT_X - half, FOOT_Y, w, 1);
}

/** Contorno oscuro de 1 px alrededor de los pixeles opacos (estilo pixel art). */
export function outline(c: Ctx, w: number, h: number): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && (d[(y * w + x) * 4 + 3] as number) === 255;
  const mark: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((d[(y * w + x) * 4 + 3] as number) === 255) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))
        mark.push(y * w + x);
    }
  }
  for (const i of mark) {
    d[i * 4] = 18;
    d[i * 4 + 1] = 14;
    d[i * 4 + 2] = 22;
    d[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}
