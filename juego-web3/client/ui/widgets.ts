import type Phaser from 'phaser';
import { FONT_CELL_W, FONT_KEY } from '../gfx/font.ts';

/** Piezas basicas de la interfaz pixel art (paneles, barras, tooltip). */

export const UI = {
  panel: 0x15111b,
  panelLight: 0x241d2c,
  border: 0x5a4a32,
  text: 0xf1ead8,
  muted: 0xa79e8a,
  hp: 0x2fae3a,
  hpLow: 0xc8321e,
  mana: 0x3a6ad8,
  rage: 0xc0281e,
  cast: 0xf2c14e,
} as const;

/** Marco con borde de 1 px y esquinas marcadas. */
export function drawPanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  border: number = UI.border,
): void {
  g.fillStyle(0x000000, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(UI.panel, 0.94).fillRect(x, y, w, h);
  g.fillStyle(border, 1);
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle(0xffffff, 0.08).fillRect(x + 1, y + 1, w - 2, 1);
}

export function drawBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  color: number,
): void {
  g.fillStyle(0x000000, 1).fillRect(x, y, w, h);
  const fw = Math.round((w - 2) * Math.max(0, Math.min(1, frac)));
  g.fillStyle(color, 1).fillRect(x + 1, y + 1, fw, h - 2);
  g.fillStyle(0xffffff, 0.18).fillRect(x + 1, y + 1, fw, 1);
}

/** Corta un texto en lineas de como mucho 'max' caracteres. */
export function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (line && `${line} ${word}`.length > max) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    out.push(line);
  }
  return out;
}

export interface TipLine {
  text: string;
  color?: number;
}

/** Tooltip multilinea con color por linea. */
export class Tooltip {
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.BitmapText[] = [];
  private owner = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(1000);
  }

  show(owner: string, x: number, y: number, lines: TipLine[]): void {
    if (this.owner === owner && this.g.visible) {
      return;
    }
    this.owner = owner;
    const rows: TipLine[] = [];
    for (const l of lines) for (const w of wrap(l.text, 28)) rows.push({ text: w, color: l.color });
    const w = Math.max(...rows.map((r) => r.text.length)) * FONT_CELL_W + 8;
    const h = rows.length * 10 + 6;
    const W = this.scene.scale.width;
    const px = Math.max(2, Math.min(W - w - 2, Math.round(x)));
    const py = Math.max(2, Math.round(y - h));
    this.g.clear();
    drawPanel(this.g, px, py, w, h, 0x8a7a5a);
    this.g.setVisible(true);
    rows.forEach((r, i) => {
      let t = this.texts[i];
      if (!t) {
        t = this.scene.add.bitmapText(0, 0, FONT_KEY, '').setDepth(1001);
        this.texts.push(t);
      }
      t.setText(r.text)
        .setTint(r.color ?? UI.text)
        .setPosition(px + 4, py + 4 + i * 10)
        .setVisible(true);
    });
    for (let i = rows.length; i < this.texts.length; i++) this.texts[i]?.setVisible(false);
  }

  hide(): void {
    this.owner = '';
    this.g.setVisible(false);
    for (const t of this.texts) t.setVisible(false);
  }
}
