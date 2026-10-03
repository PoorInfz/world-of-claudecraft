import type Phaser from 'phaser';
import { type Appearance, encodeAppearance } from '../../../shared/appearance.ts';
import { EYE_COLORS, HAIR_COLORS, RACES } from '../../../shared/data/races.ts';
import type { ClassId, FactionId } from '../../../shared/data/types.ts';
import type { Ctx } from '../pixel.ts';
import {
  ANIMS,
  type AnimName,
  animKey,
  BACK_DIRS,
  FRAME_H,
  FRAME_W,
  FRAMES_PER_DIR,
  MIRROR,
  poseFor,
  viewFor,
} from '../pose.ts';
import {
  type BodyShape,
  drawBody,
  drawFace,
  drawFeature,
  drawGear,
  drawHair,
  drawHat,
  drawHeldWeapon,
  type Geom,
  gearFor,
  geometry,
} from './layers.ts';
import { applyPalette, buildPalette } from './palette.ts';

/**
 * Composicion del personaje:
 *  1. Cada capa se dibuja UNA vez como hoja completa (8 dir x 24 frames) y se
 *     cachea por su clave (p. ej. 'pelo:humano:f:5'), en colores clave.
 *  2. El personaje se compone apilando sus capas, se le aplica la paleta
 *     (piel, pelo, ojos) y se perfila: una sola textura por aspecto, cacheada.
 * El juego nunca redibuja capas por fotograma.
 */

export interface CharacterLook {
  appearance: Appearance;
  cls: ClassId;
  faction: FactionId;
}

const SHEET_W = FRAME_W * FRAMES_PER_DIR;
const SHEET_H = FRAME_H * 8;

type LayerDraw = (c: Ctx, g: Geom) => void;
/** Cache LRU de hojas de capa (cada una ocupa ~1 MB). */
const layerCache = new Map<string, HTMLCanvasElement>();
const LAYER_CACHE_MAX = 48;

function blank(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true }) as Ctx;
  c.imageSmoothingEnabled = false;
  return [cv, c];
}

/** Hoja completa de una capa (cacheada). Las direcciones O se reflejan de las E. */
function layerSheet(key: string, shape: BodyShape, draw: LayerDraw): HTMLCanvasElement {
  const hit = layerCache.get(key);
  if (hit) {
    layerCache.delete(key);
    layerCache.set(key, hit);
    return hit;
  }
  const [sheet, sc] = blank(SHEET_W, SHEET_H);
  const [frame, fc] = blank(FRAME_W, FRAME_H);
  for (const dir of [0, 4, 5, 6, 7]) {
    const v = viewFor(dir);
    for (const [name, a] of Object.entries(ANIMS) as [AnimName, (typeof ANIMS)[AnimName]][]) {
      for (let f = 0; f < a.count; f++) {
        fc.clearRect(0, 0, FRAME_W, FRAME_H);
        draw(fc, geometry(v, poseFor(name, f), shape));
        sc.drawImage(frame, (a.start + f) * FRAME_W, dir * FRAME_H);
      }
    }
  }
  // Reflejos: SO <- SE, O <- E, NO <- NE.
  for (const [dst, src] of Object.entries(MIRROR)) {
    for (let i = 0; i < FRAMES_PER_DIR; i++) {
      fc.clearRect(0, 0, FRAME_W, FRAME_H);
      fc.save();
      fc.translate(FRAME_W, 0);
      fc.scale(-1, 1);
      fc.drawImage(sheet, i * FRAME_W, src * FRAME_H, FRAME_W, FRAME_H, 0, 0, FRAME_W, FRAME_H);
      fc.restore();
      sc.drawImage(frame, i * FRAME_W, Number(dst) * FRAME_H);
    }
  }
  layerCache.set(key, sheet);
  while (layerCache.size > LAYER_CACHE_MAX)
    layerCache.delete(layerCache.keys().next().value as string);
  return sheet;
}

/** Capas del personaje en orden de dibujo (el arma se trata aparte). */
export function layersFor(look: CharacterLook): { key: string; sheet: () => HTMLCanvasElement }[] {
  const a = look.appearance;
  const race = RACES[a.race];
  const shape: BodyShape = { race: a.race, sex: a.sex, bulk: race.bulk[a.sex] };
  const base = `${a.race}:${a.sex}`;
  const gear = gearFor(look.cls, look.faction);
  const feature = race.features[a.sex][a.feature] ?? 'ninguno';
  const list: { key: string; draw: LayerDraw }[] = [
    { key: `cuerpo:${base}`, draw: (c, g) => drawBody(c, g) },
    { key: `cara:${base}:${a.face}`, draw: (c, g) => drawFace(c, g, a.face) },
    { key: `equipo:${base}:${look.cls}:${look.faction}`, draw: (c, g) => drawGear(c, g, gear) },
    { key: `rasgo:${base}:${feature}`, draw: (c, g) => drawFeature(c, g, feature) },
    { key: `pelo:${base}:${a.hair}`, draw: (c, g) => drawHair(c, g, a.hair) },
  ];
  if (look.cls === 'mago')
    list.push({ key: `tocado:${base}:${look.faction}`, draw: (c, g) => drawHat(c, g, gear) });
  list.push({
    key: `arma:${base}:${look.cls}:${look.faction}`,
    draw: (c, g) => drawHeldWeapon(c, g, look.cls, gear),
  });
  return list.map((l) => ({ key: l.key, sheet: () => layerSheet(l.key, shape, l.draw) }));
}

/** Perfila cada fotograma sin que el contorno salte al fotograma vecino. */
function outlineSheet(d: Uint8ClampedArray, w: number, h: number): void {
  const solid = (x: number, y: number, fx0: number, fy0: number): boolean =>
    x >= fx0 &&
    y >= fy0 &&
    x < fx0 + FRAME_W &&
    y < fy0 + FRAME_H &&
    (d[(y * w + x) * 4 + 3] as number) === 255;
  const mark: number[] = [];
  for (let y = 0; y < h; y++) {
    const fy0 = Math.floor(y / FRAME_H) * FRAME_H;
    for (let x = 0; x < w; x++) {
      if ((d[(y * w + x) * 4 + 3] as number) === 255) continue;
      const fx0 = Math.floor(x / FRAME_W) * FRAME_W;
      if (
        solid(x - 1, y, fx0, fy0) ||
        solid(x + 1, y, fx0, fy0) ||
        solid(x, y - 1, fx0, fy0) ||
        solid(x, y + 1, fx0, fy0)
      )
        mark.push(y * w + x);
    }
  }
  for (const i of mark) {
    d[i * 4] = 18;
    d[i * 4 + 1] = 14;
    d[i * 4 + 2] = 22;
    d[i * 4 + 3] = 255;
  }
}

/** Compone en un lienzo (sin registrar en Phaser): util para tests y miniaturas. */
export function composeCanvas(look: CharacterLook): HTMLCanvasElement {
  const layers = layersFor(look);
  const weapon = layers[layers.length - 1] as (typeof layers)[number];
  const rest = layers.slice(0, -1);
  const [out, oc] = blank(SHEET_W, SHEET_H);
  for (let dir = 0; dir < 8; dir++) {
    const order = BACK_DIRS.has(dir) ? [weapon, ...rest] : [...rest, weapon];
    for (const l of order) {
      oc.drawImage(
        l.sheet(),
        0,
        dir * FRAME_H,
        SHEET_W,
        FRAME_H,
        0,
        dir * FRAME_H,
        SHEET_W,
        FRAME_H,
      );
    }
  }
  const a = look.appearance;
  const race = RACES[a.race];
  const img = oc.getImageData(0, 0, SHEET_W, SHEET_H);
  applyPalette(
    img.data,
    buildPalette(
      race.skinTones[a.skin] ?? '#e8b98e',
      HAIR_COLORS[a.hairColor]?.hex ?? '#6a3d1e',
      EYE_COLORS[a.eyes]?.hex ?? '#5a3418',
    ),
  );
  outlineSheet(img.data, SHEET_W, SHEET_H);
  oc.putImageData(img, 0, 0);
  return out;
}

export function lookKey(look: CharacterLook): string {
  return `pc_${encodeAppearance(look.appearance).join('.')}_${look.cls}_${look.faction}`;
}

/**
 * Textura y animaciones de un personaje (cacheadas por aspecto). Devuelve la
 * clave de la textura, compatible con animKey(clave, anim, dir).
 */
export function composeCharacter(scene: Phaser.Scene, look: CharacterLook): string {
  const key = lookKey(look);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.addCanvas(key, composeCanvas(look));
  if (!tex) throw new Error('No se pudo crear la textura del personaje');
  for (let dir = 0; dir < 8; dir++) {
    for (let i = 0; i < FRAMES_PER_DIR; i++)
      tex.add(dir * FRAMES_PER_DIR + i, 0, i * FRAME_W, dir * FRAME_H, FRAME_W, FRAME_H);
  }
  for (let dir = 0; dir < 8; dir++) {
    for (const [name, a] of Object.entries(ANIMS) as [AnimName, (typeof ANIMS)[AnimName]][]) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let f = 0; f < a.count; f++)
        frames.push({ key, frame: dir * FRAMES_PER_DIR + a.start + f });
      scene.anims.create({
        key: animKey(key, name, dir),
        frames,
        frameRate: a.fps,
        repeat: a.repeat,
      });
    }
  }
  return key;
}

/**
 * Texturas de personaje con contador de referencias: el mundo, la seleccion
 * y el creador piden un aspecto y lo sueltan; al llegar a cero se libera la
 * textura y sus animaciones.
 */
const refs = new Map<string, number>();

export function acquireCharacter(scene: Phaser.Scene, look: CharacterLook): string {
  const key = composeCharacter(scene, look);
  refs.set(key, (refs.get(key) ?? 0) + 1);
  return key;
}

export function releaseCharacter(scene: Phaser.Scene, key: string): void {
  const n = (refs.get(key) ?? 0) - 1;
  if (n > 0) {
    refs.set(key, n);
    return;
  }
  refs.delete(key);
  for (let dir = 0; dir < 8; dir++)
    for (const name of Object.keys(ANIMS)) scene.anims.remove(animKey(key, name as AnimName, dir));
  if (scene.textures.exists(key)) scene.textures.remove(key);
}
