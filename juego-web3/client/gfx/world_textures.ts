import type Phaser from 'phaser';
import { TILE_H, TILE_W } from '../../shared/constants.ts';
import { Rng } from '../../shared/rng.ts';
import { TILE } from '../../shared/tiles.ts';

/**
 * Texturas procedurales del mundo: baldosas de suelo, decoracion, iconos,
 * botin y efectos. Todo se dibuja a escala de pixel 1:1 en canvas. Para
 * sustituirlas por arte real se cargan imagenes con las mismas claves.
 */

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d', { willReadFrequently: true }) as Ctx];
}

function px(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Rombo isometrico relleno por filas. */
function diamond(
  c: Ctx,
  ox: number,
  oy: number,
  fill: (x: number, y: number) => string | null,
): void {
  for (let y = 0; y < TILE_H; y++) {
    const half = y < TILE_H / 2 ? (y + 1) * 2 : (TILE_H - y) * 2;
    for (let x = TILE_W / 2 - half; x < TILE_W / 2 + half; x++) {
      const col = fill(x, y);
      if (col) px(c, ox + x, oy + y, 1, 1, col);
    }
  }
}

interface GroundStyle {
  base: string;
  dots: string[];
  density: number;
}

const GROUND: Record<number, GroundStyle> = {
  [TILE.hierba]: { base: '#4f8a3a', dots: ['#5f9c44', '#447a32'], density: 0.18 },
  [TILE.hierba2]: { base: '#558f3d', dots: ['#679f48', '#4a7f35'], density: 0.22 },
  [TILE.hierba_flores]: {
    base: '#4f8a3a',
    dots: ['#f2e06a', '#e87a9a', '#ffffff', '#5f9c44'],
    density: 0.12,
  },
  [TILE.tierra]: { base: '#8a6a44', dots: ['#9a7a52', '#765a38', '#a68858'], density: 0.25 },
  [TILE.piedra]: { base: '#8c8a86', dots: ['#a19f9a', '#74726e'], density: 0.2 },
  [TILE.agua]: { base: '#2f6aa8', dots: ['#3f82c2', '#5aa0d8'], density: 0.08 },
  [TILE.arena]: { base: '#c8b07a', dots: ['#d8c28a', '#b49c66'], density: 0.2 },
  [TILE.hierba_oscura]: { base: '#3a5a32', dots: ['#2f4a2a', '#4a6a3a', '#5a3a5a'], density: 0.2 },
};

/** Textura 'suelo' con un fotograma por baldosa (id local de Tiled). */
function groundTiles(scene: Phaser.Scene): void {
  const ids = Object.keys(GROUND).map(Number);
  const [cv, c] = canvas(TILE_W * ids.length, TILE_H);
  ids.forEach((id, i) => {
    const st = GROUND[id] as GroundStyle;
    const rng = new Rng(1000 + id);
    diamond(c, i * TILE_W, 0, (x, y) => {
      if (id === TILE.piedra && (x + y * 2) % 8 === 0) return '#6a6864';
      if (id === TILE.agua && y % 4 === 1 && (x + y) % 7 < 3) return '#7ab8e8';
      if (rng.chance(st.density)) return rng.pick(st.dots);
      // Borde inferior un poco mas oscuro para dar volumen.
      if (y >= TILE_H - 2) return shade(st.base, -14);
      return st.base;
    });
  });
  const tex = scene.textures.addCanvas('suelo', cv);
  ids.forEach((id, i) => {
    tex?.add(id, 0, i * TILE_W, 0, TILE_W, TILE_H);
  });
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function outline(c: Ctx, w: number, h: number, color = [16, 20, 14]): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && (d[(y * w + x) * 4 + 3] as number) > 200;
  const mark: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((d[(y * w + x) * 4 + 3] as number) > 200) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))
        mark.push(y * w + x);
    }
  for (const i of mark) {
    d[i * 4] = color[0] as number;
    d[i * 4 + 1] = color[1] as number;
    d[i * 4 + 2] = color[2] as number;
    d[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

/** Poligono convexo relleno por lineas horizontales (sin antialias). */
function poly(c: Ctx, pts: [number, number][], color: string): void {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  c.fillStyle = color;
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as [number, number];
      const b = pts[(i + 1) % pts.length] as [number, number];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        const x = a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    if (hi > lo) c.fillRect(Math.round(lo), y, Math.round(hi) - Math.round(lo), 1);
  }
}

function blob(
  c: Ctx,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  rng: Rng,
  rough = 0.15,
): void {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d <= 1 - rng.next() * rough) px(c, cx + x, cy + y, 1, 1, color);
    }
}

/** Decoracion: cada una es una textura propia con el pie en el centro inferior. */
function decoTextures(scene: Phaser.Scene): void {
  const add = (
    id: number,
    w: number,
    h: number,
    draw: (c: Ctx, rng: Rng) => void,
    line = true,
  ): void => {
    const [cv, c] = canvas(w, h);
    draw(c, new Rng(77 + id));
    if (line) outline(c, w, h);
    scene.textures.addCanvas(`deco_${id}`, cv);
  };

  add(TILE.pino, 24, 46, (c) => {
    px(c, 10, 38, 4, 7, '#5a3a22');
    const greens = ['#1f4a2a', '#2a5e34', '#357040'];
    for (let layer = 0; layer < 4; layer++) {
      const top = 4 + layer * 8;
      for (let y = 0; y < 12; y++) {
        const w = Math.min(22, 4 + y * 1.6 + layer * 1.5);
        px(c, 12 - w / 2, top + y, w, 1, greens[(y + layer) % 3] as string);
      }
    }
    px(c, 11, 2, 2, 3, '#2a5e34');
  });
  add(TILE.roble, 32, 42, (c, rng) => {
    px(c, 13, 28, 6, 13, '#6a4428');
    px(c, 13, 28, 2, 13, '#7a5232');
    blob(c, 16, 18, 13, 11, '#2f6a2e', rng);
    blob(c, 11, 15, 7, 6, '#3f7e38', rng);
    blob(c, 20, 13, 6, 5, '#4a8c40', rng);
  });
  add(TILE.roca, 20, 14, (c, rng) => {
    blob(c, 10, 8, 8, 5, '#7a7874', rng, 0.1);
    blob(c, 8, 6, 4, 2, '#9a9894', rng, 0.1);
  });
  add(TILE.arbusto, 18, 12, (c, rng) => {
    blob(c, 9, 7, 8, 4, '#3a7a34', rng);
    px(c, 5, 5, 1, 1, '#e86a7a');
    px(c, 12, 6, 1, 1, '#e86a7a');
  });
  add(TILE.casa, 48, 60, (c) => {
    // Caja isometrica sobre una baldosa: base en rombo, muros de 18 px y tejado a dos aguas.
    const cx = 24;
    const base = 56;
    const wall = 18;
    // Muro izquierdo (sombra) y derecho (luz).
    poly(
      c,
      [
        [cx - 16, base - 8],
        [cx, base],
        [cx, base - wall],
        [cx - 16, base - 8 - wall],
      ],
      '#b89a72',
    );
    poly(
      c,
      [
        [cx, base],
        [cx + 16, base - 8],
        [cx + 16, base - 8 - wall],
        [cx, base - wall],
      ],
      '#d8bc90',
    );
    // Puerta y ventana.
    poly(
      c,
      [
        [cx + 5, base - 3],
        [cx + 9, base - 5],
        [cx + 9, base - 13],
        [cx + 5, base - 11],
      ],
      '#5a3a22',
    );
    poly(
      c,
      [
        [cx - 11, base - 11],
        [cx - 7, base - 9],
        [cx - 7, base - 13],
        [cx - 11, base - 15],
      ],
      '#f2d27a',
    );
    // Tejado.
    const top = base - wall;
    poly(
      c,
      [
        [cx - 19, top - 7],
        [cx, top + 3],
        [cx, top - 24],
        [cx - 9, top - 28],
      ],
      '#8a2e22',
    );
    poly(
      c,
      [
        [cx, top + 3],
        [cx + 19, top - 7],
        [cx + 9, top - 28],
        [cx, top - 24],
      ],
      '#a83a2a',
    );
    for (let i = 1; i < 6; i++) {
      const y = top + 3 - i * 5;
      c.fillStyle = '#6a2018';
      c.fillRect(cx - 19 + i * 2, Math.round(y - 9 + i * 0.5), 18 - i * 2, 1);
    }
  });
  add(TILE.columna, 14, 36, (c) => {
    px(c, 2, 30, 10, 5, '#8c8a86');
    px(c, 3, 6, 8, 25, '#a8a6a0');
    px(c, 3, 6, 2, 25, '#c0beb8');
    px(c, 2, 4, 10, 3, '#8c8a86');
    px(c, 4, 1, 3, 3, '#a8a6a0');
    px(c, 7, 15, 3, 1, '#6a6864');
  });
  add(TILE.tienda, 40, 30, (c) => {
    for (let y = 0; y < 22; y++) {
      const w = 4 + y * 1.6;
      px(c, 20 - w / 2, 6 + y, w / 2, 1, '#4a2a5a');
      px(c, 20, 6 + y, w / 2, 1, '#6a3a7a');
    }
    px(c, 18, 18, 4, 10, '#1a0a20');
    px(c, 19, 2, 2, 5, '#5a3a22');
    px(c, 21, 2, 4, 2, '#a02a3a');
  });
  add(TILE.hoguera, 16, 14, (c) => {
    px(c, 2, 10, 12, 3, '#5a3a22');
    px(c, 4, 9, 8, 2, '#7a5232');
    px(c, 5, 4, 6, 6, '#ff8a2a');
    px(c, 6, 2, 4, 5, '#ffcf3a');
    px(c, 7, 1, 2, 3, '#fff4b0');
  });
  add(TILE.lapida, 12, 16, (c) => {
    px(c, 2, 3, 8, 12, '#8c8a86');
    px(c, 3, 1, 6, 2, '#8c8a86');
    px(c, 5, 5, 2, 6, '#5a5854');
    px(c, 3, 7, 6, 2, '#5a5854');
  });
}

/** Iconos de 16x16 para habilidades y objetos. */
const ICONS: Record<string, { bg: [string, string]; draw: (c: Ctx) => void }> = {
  espada: { bg: ['#5a2a1a', '#2a1410'], draw: (c) => diag(c, '#e8edf2', '#f2c14e') },
  carga: { bg: ['#5a3a1a', '#2a1a0a'], draw: (c) => arrowRight(c, '#ffcf3a') },
  torbellino: { bg: ['#4a3a2a', '#20160e'], draw: (c) => swirl(c, '#e8edf2') },
  tendon: {
    bg: ['#5a1a1a', '#200808'],
    draw: (c) => {
      diag(c, '#c8d0d8', '#888');
      drops(c, '#d03030');
    },
  },
  grito: { bg: ['#6a4a1a', '#2a1a08'], draw: (c) => rings(c, '#ffd84a') },
  escudo: { bg: ['#2a3a5a', '#101828'], draw: (c) => shield(c, '#b8c2cc', '#f2c14e') },
  fuego: { bg: ['#6a2a0a', '#2a0a04'], draw: (c) => flame(c) },
  hielo: { bg: ['#1a3a6a', '#081428'], draw: (c) => shard(c, '#bfe8ff') },
  nova: { bg: ['#1a4a7a', '#081830'], draw: (c) => star(c, '#e8f8ff') },
  arcano: { bg: ['#4a1a6a', '#1a0828'], draw: (c) => star(c, '#e0a8ff') },
  parpadeo: { bg: ['#3a1a6a', '#140828'], draw: (c) => arrowRight(c, '#c88aff') },
  armadura: { bg: ['#1a3a5a', '#081420'], draw: (c) => shield(c, '#bfe8ff', '#ffffff') },
  sombra: { bg: ['#2a0a3a', '#0a0410'], draw: (c) => swirl(c, '#b84aff') },
  colmillo: { bg: ['#3a3a3a', '#181818'], draw: (c) => fang(c) },
  piel: { bg: ['#4a3a2a', '#1a140e'], draw: (c) => hide(c) },
  hueso: { bg: ['#3a3a3a', '#181818'], draw: (c) => bone(c) },
  arco: { bg: ['#3a2a1a', '#18100a'], draw: (c) => bow(c) },
  tunica: { bg: ['#2a1a3a', '#100818'], draw: (c) => robe(c) },
  botas: { bg: ['#3a2a1a', '#18100a'], draw: (c) => boots(c) },
  amuleto: { bg: ['#3a2a10', '#181006'], draw: (c) => amulet(c) },
};

function diag(c: Ctx, blade: string, hilt: string): void {
  for (let i = 0; i < 9; i++) px(c, 4 + i, 11 - i, 2, 1, blade);
  px(c, 3, 10, 4, 1, hilt);
  px(c, 4, 9, 1, 4, hilt);
  px(c, 2, 12, 2, 2, '#7a5232');
}
function arrowRight(c: Ctx, col: string): void {
  px(c, 3, 7, 8, 2, col);
  for (let i = 0; i < 4; i++) px(c, 10 + i, 4 + i, 1, 8 - i * 2, col);
}
function swirl(c: Ctx, col: string): void {
  for (let a = 0; a < 18; a++) {
    const r = 1 + a * 0.33;
    px(c, 8 + Math.cos(a * 0.7) * r, 8 + Math.sin(a * 0.7) * r, 1, 1, col);
  }
}
function drops(c: Ctx, col: string): void {
  px(c, 11, 10, 1, 2, col);
  px(c, 13, 12, 1, 2, col);
}
function rings(c: Ctx, col: string): void {
  for (const r of [2, 4, 6])
    for (let a = 0; a < 16; a++)
      px(c, 8 + Math.cos((a / 16) * 6.28) * r, 8 + Math.sin((a / 16) * 6.28) * r, 1, 1, col);
}
function shield(c: Ctx, body: string, trim: string): void {
  for (let y = 0; y < 10; y++) {
    const w = y < 6 ? 10 : 10 - (y - 5) * 2;
    px(c, 8 - w / 2, 3 + y, w, 1, body);
  }
  px(c, 7, 4, 2, 8, trim);
}
function flame(c: Ctx): void {
  for (let y = 0; y < 11; y++) {
    const w = Math.max(1, Math.round(Math.sin((y / 11) * Math.PI) * 9));
    px(c, 8 - w / 2, 3 + y, w, 1, y < 4 ? '#ffe28a' : y < 8 ? '#ffa02a' : '#e8501a');
  }
}
function shard(c: Ctx, col: string): void {
  for (let i = 0; i < 9; i++) px(c, 4 + i, 12 - i, 3, 1, col);
  px(c, 11, 3, 2, 2, '#ffffff');
}
function star(c: Ctx, col: string): void {
  px(c, 7, 2, 2, 12, col);
  px(c, 2, 7, 12, 2, col);
  for (let i = 0; i < 4; i++) {
    px(c, 4 + i, 4 + i, 1, 1, col);
    px(c, 11 - i, 4 + i, 1, 1, col);
    px(c, 4 + i, 11 - i, 1, 1, col);
    px(c, 11 - i, 11 - i, 1, 1, col);
  }
}
function fang(c: Ctx): void {
  for (let y = 0; y < 10; y++) px(c, 6 + y * 0.3, 3 + y, Math.max(1, 4 - y * 0.4), 1, '#f4f0e0');
}
function hide(c: Ctx): void {
  px(c, 3, 4, 10, 8, '#8a6a44');
  px(c, 2, 3, 2, 2, '#8a6a44');
  px(c, 12, 3, 2, 2, '#8a6a44');
  px(c, 2, 11, 2, 2, '#8a6a44');
  px(c, 12, 11, 2, 2, '#8a6a44');
}
function bone(c: Ctx): void {
  for (let i = 0; i < 8; i++) px(c, 4 + i, 11 - i, 2, 1, '#e6e0cc');
  px(c, 2, 11, 3, 3, '#e6e0cc');
  px(c, 11, 2, 3, 3, '#e6e0cc');
}
function bow(c: Ctx): void {
  for (let y = 0; y < 12; y++)
    px(c, 5 + Math.round(Math.sin((y / 11) * Math.PI) * 4), 2 + y, 1, 1, '#a07040');
  px(c, 5, 2, 1, 12, '#dddddd');
}
function robe(c: Ctx): void {
  for (let y = 0; y < 11; y++) px(c, 8 - (3 + y * 0.4), 3 + y, 6 + y * 0.8, 1, '#5a2d78');
  px(c, 7, 3, 2, 11, '#a02a3a');
}
function boots(c: Ctx): void {
  px(c, 4, 3, 4, 9, '#6a4428');
  px(c, 4, 11, 8, 3, '#6a4428');
  px(c, 4, 6, 4, 1, '#3a8a3a');
}
function amulet(c: Ctx): void {
  for (let a = 0; a < 12; a++)
    px(c, 8 + Math.cos((a / 12) * 3.14) * 5, 3 + Math.sin((a / 12) * 3.14) * 4, 1, 1, '#c8a040');
  px(c, 6, 8, 5, 5, '#ffa020');
  px(c, 7, 9, 2, 2, '#ffe080');
}

function iconTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(ICONS)) {
    const [cv, c] = canvas(16, 16);
    for (let y = 0; y < 16; y++) px(c, 0, y, 16, 1, y < 8 ? def.bg[0] : def.bg[1]);
    def.draw(c);
    scene.textures.addCanvas(`icon_${key}`, cv);
  }
}

/** Particulas, proyectiles, botin y marcadores. */
function fxTextures(scene: Phaser.Scene): void {
  {
    const [cv, c] = canvas(2, 2);
    px(c, 0, 0, 2, 2, '#ffffff');
    scene.textures.addCanvas('px', cv);
  }
  {
    const [cv, c] = canvas(16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5) / 8;
        if (d < 1) {
          c.fillStyle = `rgba(255,255,255,${(1 - d) * (1 - d) * 0.9})`;
          c.fillRect(x, y, 1, 1);
        }
      }
    scene.textures.addCanvas('glow', cv);
  }
  {
    // Bola de proyectil: nucleo blanco, se tinta por escuela.
    const [cv, c] = canvas(6, 6);
    px(c, 1, 0, 4, 6, '#dddddd');
    px(c, 0, 1, 6, 4, '#dddddd');
    px(c, 2, 1, 2, 3, '#ffffff');
    scene.textures.addCanvas('orb', cv);
  }
  {
    const [cv, c] = canvas(8, 3);
    px(c, 0, 1, 6, 1, '#c8b08a');
    px(c, 6, 0, 2, 3, '#e8e8e8');
    scene.textures.addCanvas('arrow', cv);
  }
  {
    const [cv, c] = canvas(14, 12);
    px(c, 3, 3, 8, 8, '#8a6a3a');
    px(c, 2, 5, 10, 5, '#8a6a3a');
    px(c, 5, 1, 4, 3, '#6a4a2a');
    px(c, 5, 3, 4, 1, '#f2c14e');
    px(c, 6, 6, 2, 2, '#ffe28a');
    outline(c, 14, 12);
    scene.textures.addCanvas('loot', cv);
  }
}

export function generateWorldTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists('suelo')) return;
  groundTiles(scene);
  decoTextures(scene);
  iconTextures(scene);
  fxTextures(scene);
}

/** Color de cada escuela de dano (proyectiles, numeros flotantes). */
export const SCHOOL_COLORS: Record<string, number> = {
  fisico: 0xffffff,
  fuego: 0xff8a2a,
  hielo: 0x8ad8ff,
  sombra: 0xb84aff,
  naturaleza: 0x6ae05a,
  arcano: 0xe0a8ff,
};
