import type Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH } from '../../shared/constants.ts';
import { Rng } from '../../shared/rng.ts';
import type { Ctx } from './pixel.ts';

/**
 * Fondos pixel art de 640x360 para las pantallas de seleccion y creacion,
 * uno tematico por raza. Placeholders procedurales: se sustituyen por una
 * imagen con la misma clave ('fondo_<id>').
 */

export type BackgroundId = 'seleccion' | 'facciones' | 'humano' | 'orco';

function sky(c: Ctx, bands: string[], h: number, rng: Rng): void {
  const bandH = h / bands.length;
  bands.forEach((col, i) => {
    c.fillStyle = col;
    c.fillRect(0, Math.floor(i * bandH), BASE_WIDTH, Math.ceil(bandH));
    // Tramado entre bandas.
    const next = bands[i + 1];
    if (!next) return;
    c.fillStyle = next;
    const y0 = Math.floor((i + 1) * bandH) - 3;
    for (let y = y0; y < y0 + 3; y++)
      for (let x = (y % 2) + rng.int(0, 1); x < BASE_WIDTH; x += 2) c.fillRect(x, y, 1, 1);
  });
}

function ridge(c: Ctx, base: number, amp: number, color: string, rng: Rng, jag = 0.3): void {
  c.fillStyle = color;
  let y = base;
  for (let x = 0; x < BASE_WIDTH; x++) {
    y += (rng.next() - 0.5) * amp * jag;
    y += (base - y) * 0.03;
    c.fillRect(x, Math.round(y), 1, BASE_HEIGHT - Math.round(y));
  }
}

function stars(c: Ctx, n: number, maxY: number, rng: Rng, color = '#ffffff'): void {
  c.fillStyle = color;
  for (let i = 0; i < n; i++) c.fillRect(rng.int(0, BASE_WIDTH - 1), rng.int(0, maxY), 1, 1);
}

function humano(c: Ctx, rng: Rng): void {
  sky(c, ['#2a3a6a', '#3e5a8a', '#6a82a8', '#c89a6a', '#f2c14e', '#f6dca0'], 230, rng);
  c.fillStyle = '#fff4d6';
  c.fillRect(470, 150, 18, 18);
  ridge(c, 210, 30, '#3a4a6a', rng);
  ridge(c, 245, 20, '#2f4a32', rng);
  // Castillo.
  c.fillStyle = '#5a5e6a';
  c.fillRect(120, 150, 150, 110);
  for (const tx of [110, 170, 250]) {
    c.fillRect(tx, 120, 30, 140);
    for (let i = 0; i < 3; i++) c.fillRect(tx + i * 12, 114, 6, 6);
  }
  c.fillStyle = '#f2d27a';
  for (const [x, y] of [
    [125, 140],
    [185, 135],
    [265, 140],
    [150, 190],
    [220, 190],
  ])
    c.fillRect(x as number, y as number, 4, 6);
  c.fillStyle = '#2a1a10';
  c.fillRect(180, 220, 30, 40);
  // Estandartes dorados.
  for (const x of [118, 258]) {
    c.fillStyle = '#7a5230';
    c.fillRect(x + 6, 90, 2, 30);
    c.fillStyle = '#f2c14e';
    c.fillRect(x + 8, 92, 14, 18);
    c.fillStyle = '#4f8fe0';
    c.fillRect(x + 13, 96, 4, 10);
  }
  ridge(c, 290, 10, '#3f6a2e', rng, 0.15);
  ridge(c, 320, 8, '#2f5a26', rng, 0.15);
}

function orco(c: Ctx, rng: Rng): void {
  sky(c, ['#14060c', '#2a0a14', '#4a1018', '#7a1a1a', '#a02a1a', '#c84a1a'], 230, rng);
  stars(c, 30, 80, rng, '#d08a8a');
  c.fillStyle = '#ffb04a';
  c.fillRect(140, 140, 22, 22);
  ridge(c, 190, 80, '#2a0e14', rng, 0.6);
  ridge(c, 240, 30, '#1a0a0e', rng, 0.4);
  // Chozas con pinchos.
  for (const [x, w] of [
    [360, 70],
    [450, 90],
    [560, 60],
  ]) {
    const hx = x as number;
    const hw = w as number;
    c.fillStyle = '#3a2418';
    for (let y = 0; y < 40; y++) {
      const ww = Math.round(hw * (y / 40));
      c.fillRect(hx + (hw - ww) / 2, 210 + y, ww, 1);
    }
    c.fillStyle = '#e6e0cc';
    for (let i = 0; i < 5; i++) c.fillRect(hx + 6 + i * (hw / 5), 222 + (i % 2) * 6, 2, 6);
    c.fillStyle = '#ff7a2a';
    c.fillRect(hx + hw / 2 - 4, 238, 8, 12);
  }
  // Estandarte de la Sombra.
  c.fillStyle = '#3a2418';
  c.fillRect(300, 120, 3, 130);
  c.fillStyle = '#7b3fa0';
  c.fillRect(303, 124, 22, 30);
  c.fillStyle = '#a02a3a';
  c.fillRect(310, 130, 8, 16);
  ridge(c, 290, 10, '#2a1a12', rng, 0.15);
  ridge(c, 322, 8, '#1a100a', rng, 0.15);
}

function seleccion(c: Ctx, rng: Rng): void {
  c.fillStyle = '#16121c';
  c.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  // Muro de piedra.
  for (let y = 0; y < 260; y += 10) {
    for (let x = (y / 10) % 2 ? -10 : 0; x < BASE_WIDTH; x += 20) {
      c.fillStyle = rng.pick(['#2a2432', '#2e2836', '#26202e']);
      c.fillRect(x + 1, y + 1, 18, 8);
    }
  }
  // Suelo.
  c.fillStyle = '#3a3226';
  c.fillRect(0, 260, BASE_WIDTH, 100);
  for (let y = 262; y < BASE_HEIGHT; y += 6) {
    c.fillStyle = '#332b20';
    c.fillRect(0, y, BASE_WIDTH, 1);
  }
  // Antorchas.
  for (const x of [120, 520]) {
    c.fillStyle = '#5a3a22';
    c.fillRect(x, 120, 4, 20);
    c.fillStyle = '#ff9a2a';
    c.fillRect(x - 2, 110, 8, 10);
    c.fillStyle = '#ffe28a';
    c.fillRect(x, 112, 4, 6);
  }
  // Estrado.
  c.fillStyle = '#4a4036';
  c.fillRect(250, 268, 140, 8);
  c.fillStyle = '#5a4e42';
  c.fillRect(260, 262, 120, 6);
}

function facciones(c: Ctx, rng: Rng): void {
  humano(c, rng);
  const img = c.getImageData(0, 0, BASE_WIDTH / 2, BASE_HEIGHT);
  orco(c, rng);
  c.putImageData(img, 0, 0);
  c.fillStyle = '#000000';
  c.fillRect(BASE_WIDTH / 2 - 1, 0, 2, BASE_HEIGHT);
}

const DRAW: Record<BackgroundId, (c: Ctx, rng: Rng) => void> = {
  seleccion,
  facciones,
  humano,
  orco,
};

export function backgroundKey(id: BackgroundId): string {
  const key = `fondo_${id}`;
  return key;
}

export function ensureBackground(scene: Phaser.Scene, id: BackgroundId): string {
  const key = backgroundKey(id);
  if (scene.textures.exists(key)) return key;
  const cv = document.createElement('canvas');
  cv.width = BASE_WIDTH;
  cv.height = BASE_HEIGHT;
  const c = cv.getContext('2d', { willReadFrequently: true }) as Ctx;
  DRAW[id](c, new Rng(id.length * 977));
  scene.textures.addCanvas(key, cv);
  return key;
}
