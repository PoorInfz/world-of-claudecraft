import type Phaser from 'phaser';
import { FONT_CELL_W, FONT_KEY } from '../gfx/font.ts';
import { drawPanel, UI } from './widgets.ts';

/**
 * Controles de menu en pixel art (botones, textos, paneles). Cada pantalla
 * los crea dentro de un Container y lo reconstruye entero al cambiar de
 * estado: los menus son pequenos y asi no hay estado de UI desincronizado.
 */

export interface ButtonOpts {
  selected?: boolean;
  disabled?: boolean;
  /** Color del borde (por defecto dorado al seleccionar). */
  accent?: number;
  big?: boolean;
}

export function button(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: ButtonOpts = {},
): void {
  const g = scene.add.graphics();
  const accent = opts.accent ?? 0xf2c14e;
  const paint = (hover: boolean): void => {
    g.clear();
    drawPanel(
      g,
      x,
      y,
      w,
      h,
      opts.selected ? accent : hover && !opts.disabled ? 0xc8a860 : UI.border,
    );
    if (opts.selected) g.fillStyle(accent, 0.18).fillRect(x + 1, y + 1, w - 2, h - 2);
  };
  paint(false);
  const t = scene.add
    .bitmapText(Math.round(x + w / 2), Math.round(y + h / 2 + 1), FONT_KEY, label)
    .setOrigin(0.5, 0.5)
    .setScale(opts.big ? 2 : 1)
    .setTint(opts.disabled ? 0x6a6458 : opts.selected ? 0xffe8a0 : UI.text);
  const zone = scene.add.zone(x, y, w, h).setOrigin(0, 0);
  if (!opts.disabled) {
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => paint(true));
    zone.on('pointerout', () => paint(false));
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) onClick();
    });
  }
  parent.add([g, t, zone]);
}

export function text(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  value: string,
  tint: number = UI.text,
  origin: [number, number] = [0, 0],
  scale = 1,
): Phaser.GameObjects.BitmapText {
  const t = scene.add
    .bitmapText(Math.round(x), Math.round(y), FONT_KEY, value)
    .setOrigin(origin[0], origin[1])
    .setTint(tint)
    .setScale(scale);
  parent.add(t);
  return t;
}

/** Texto multilinea ajustado a un ancho en pixeles. */
export function paragraph(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  width: number,
  value: string,
  tint: number = UI.text,
): number {
  const max = Math.floor(width / FONT_CELL_W);
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(' ')) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    text(scene, parent, x, y + i * 10, l, tint);
  });
  return lines.length * 10;
}

export function panel(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  border?: number,
): void {
  const g = scene.add.graphics();
  drawPanel(g, x, y, w, h, border);
  parent.add(g);
}

/** Fondo de 640x360 centrado; el resto se rellena con su color de borde. */
export function background(
  scene: Phaser.Scene,
  key: string,
  fill: number,
): Phaser.GameObjects.Image {
  scene.cameras.main.setBackgroundColor(fill);
  return scene.add
    .image(Math.round(scene.scale.width / 2), Math.round(scene.scale.height / 2), key)
    .setOrigin(0.5, 0.5)
    .setDepth(-10);
}

/** Color numerico desde '#rrggbb'. */
export function hexColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}
