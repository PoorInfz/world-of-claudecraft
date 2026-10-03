import { type Ctx, line, rect } from './pixel.ts';
import type { Pose } from './pose.ts';

export type WeaponKind = 'sword' | 'staff' | 'bow' | 'none';

/** Arma en la mano (hx, hy). La comparten los personajes por capas y los enemigos. */
export function drawWeapon(
  c: Ctx,
  kind: WeaponKind,
  trim: string,
  glow: string,
  hx: number,
  hy: number,
  pose: Pose,
  side: number,
): void {
  if (kind === 'sword') {
    const a = -Math.PI / 2 + side * (0.45 + pose.swing);
    const len = 11;
    const tx = hx + Math.cos(a) * len;
    const ty = hy + Math.sin(a) * len;
    line(c, hx, hy, tx, ty, '#e8edf2');
    line(c, hx + 1, hy, tx + 1, ty, '#9aa4ae');
    const gx = Math.cos(a + Math.PI / 2) * 2;
    const gy = Math.sin(a + Math.PI / 2) * 2;
    line(c, hx - gx, hy - gy, hx + gx, hy + gy, trim);
  } else if (kind === 'staff') {
    const lift = Math.round(pose.raise * 5);
    const x = Math.round(hx);
    line(c, x, hy - 9 - lift, x, hy + 8 - lift, '#7a5230');
    rect(c, x - 1, hy - 12 - lift, 3, 3, glow);
    if (pose.glow) {
      c.fillStyle = glow;
      for (let i = 0; i < pose.glow * 2; i++)
        c.fillRect(x - 2 + ((i * 3) % 5), hy - 15 - lift - (i % 2), 1, 1);
    }
  } else if (kind === 'bow') {
    const x = Math.round(hx + side);
    line(c, x, hy - 6, x + side * 2, hy - 3, '#7a5230');
    line(c, x + side * 2, hy - 3, x + side * 2, hy + 3, '#7a5230');
    line(c, x + side * 2, hy + 3, x, hy + 6, '#7a5230');
    const pull = pose.swing > 1 ? -side * 2 : 0;
    line(c, x, hy - 6, x + pull, hy, '#ddd');
    line(c, x + pull, hy, x, hy + 6, '#ddd');
  }
}
