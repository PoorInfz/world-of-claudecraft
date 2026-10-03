import { FACTIONS } from '../../../shared/data/factions.ts';
import type { RaceId, Sex } from '../../../shared/data/races.ts';
import type { ClassId, FactionId } from '../../../shared/data/types.ts';
import { type Ctx, line, rect, shadow } from '../pixel.ts';
import { FOOT_X, type Pose, type View } from '../pose.ts';
import { drawWeapon } from '../weapons.ts';
import { KEY } from './palette.ts';

/**
 * Capas del muneco (paper doll). Todas parten de la MISMA geometria por
 * fotograma (Geom), calculada a partir de la pose y de las proporciones de la
 * raza y el sexo; por eso las capas encajan en cualquier direccion y
 * animacion. Piel, pelo y ojos se pintan con colores clave (ver palette.ts).
 */

export interface BodyShape {
  race: RaceId;
  sex: Sex;
  /** 0 normal, 1 corpulento. */
  bulk: number;
}

export interface Geom {
  v: View;
  pose: Pose;
  shape: BodyShape;
  /** Tumbado (ultimos fotogramas de la muerte). */
  lying: boolean;
  cx: number;
  oy: number;
  kneel: number;
  legTop: number;
  legH: number;
  /** Torso. */
  tx: number;
  ty: number;
  tw: number;
  /** Cabeza. */
  hx: number;
  hy: number;
  hw: number;
  /** Mano del arma y lado (1 delante, -1 detras). */
  handX: number;
  handY: number;
  side: number;
}

export function geometry(v: View, pose: Pose, shape: BodyShape): Geom {
  const lying = pose.down >= 0.85;
  const kneel = pose.down >= 0.5 ? 5 : pose.down > 0 ? 1 : 0;
  const lx = v.side ? pose.lunge : 0;
  const ly = v.front ? pose.lunge : v.back ? -pose.lunge : 0;
  const ox = lx - (v.side ? pose.lean : 0);
  const oy = ly + pose.bob + kneel - (v.front ? pose.lean : 0);
  const cx = FOOT_X + ox;
  const female = shape.sex === 'f';
  const bulk = shape.bulk;
  const tw = v.side ? 7 + bulk : 10 + bulk * 2 - (female ? 2 : 0);
  const hw = v.side ? 7 : 8 + bulk;
  const side = v.back ? -1 : 1;
  return {
    v,
    pose,
    shape,
    lying,
    cx,
    oy,
    kneel,
    legTop: 29 + oy,
    legH: Math.max(2, 8 - kneel),
    tx: cx - Math.floor(tw / 2),
    ty: 19 + oy + (bulk ? 1 : 0),
    tw,
    hx: cx - Math.floor(hw / 2) + (v.side ? 1 : 0) + v.fx * (v.side ? 0 : 1),
    hy: 11 + oy + (bulk ? 1 : 0),
    hw,
    handX: v.side
      ? cx + 3
      : v.front
        ? cx + 6 + bulk - (female ? 1 : 0)
        : cx - 7 - bulk + (female ? 1 : 0),
    handY: 26 + oy - Math.round(pose.raise * 6) + pose.arm,
    side,
  };
}

/**
 * Silueta del torso fila a fila (10 filas): [x, ancho]. El cuerpo y la
 * armadura usan la misma funcion, asi que la ropa sigue la silueta.
 * Femenina: cintura marcada y cadera; masculina: recta.
 */
export function torsoRow(g: Geom, i: number): [number, number] {
  if (g.shape.sex === 'f' && !g.v.side) {
    const inset = i >= 4 && i <= 6 ? 1 : 0;
    const hip = i >= 8 ? -1 : 0;
    return [g.tx + inset + hip, g.tw - (inset + hip) * 2];
  }
  return [g.tx, g.tw];
}

function torso(c: Ctx, g: Geom, color: (i: number) => string): void {
  for (let i = 0; i < 10; i++) {
    const [x, w] = torsoRow(g, i);
    rect(c, x, g.ty + i, w, 1, color(i));
  }
}

const [SK, SKM, SKD] = KEY.skin;
const [HL, HM, HD] = KEY.hair;

// ------------------------------------------------------------------ cuerpo
/** Cuerpo base desnudo (piel en colores clave) y sombra. */
export function drawBody(c: Ctx, g: Geom): void {
  if (g.lying) {
    shadow(c, 18);
    rect(c, 8, 32, 13, 5, SKM);
    rect(c, 21, 33, 6, 3, SKD);
    rect(c, 2, 31, 6, 6, SK);
    return;
  }
  const { v, pose, cx, tx, ty, tw, hx, hy, hw } = g;
  shadow(c);
  // Piernas.
  if (v.side) {
    rect(c, cx - 2 + pose.leg, g.legTop, 3, g.legH - Math.max(0, pose.leg), SKD);
    rect(c, cx - 1 - pose.leg, g.legTop, 3, g.legH - Math.max(0, -pose.leg), SKM);
  } else {
    rect(c, cx - 4 - g.shape.bulk, g.legTop, 3, g.legH - Math.max(0, pose.leg), SKM);
    rect(c, cx + 1 + g.shape.bulk, g.legTop, 3, g.legH - Math.max(0, -pose.leg), SKM);
  }
  // Torso.
  torso(c, g, () => SKM);
  if (g.shape.sex === 'f' && !v.back && !v.side) rect(c, tx + 2, ty + 3, tw - 4, 1, SKD);
  // Brazos.
  if (pose.raise > 0) {
    const up = Math.round(pose.raise * 3);
    rect(c, tx - 2, ty - 4 - up, 2, 8, SKM);
    rect(c, tx + tw, ty - 4 - up, 2, 8, SKM);
  } else if (v.side) {
    rect(c, cx - 1 + pose.arm, ty + 1, 2, 8, SKD);
  } else {
    rect(c, tx - 2, ty + 1 + pose.arm, 2, 8, SKM);
    rect(c, tx + tw, ty + 1 - pose.arm, 2, 8, SKM);
  }
  // Cuello y cabeza.
  rect(c, cx - 1, hy + 6, 3, 2, SKD);
  rect(c, hx, hy, hw, 7, SK);
  rect(c, hx, hy + 6, hw, 1, SKM);
  // Orejas: redondas (humano) o puntiagudas (orco).
  if (!v.back || v.side) {
    const pointy = g.shape.race === 'orco';
    if (v.side) {
      rect(c, hx + 1, hy + 2, 1, 2, SKD);
      if (pointy) rect(c, hx, hy + 1, 1, 1, SKD);
    } else {
      rect(c, hx - 1, hy + 3, 1, 2, SKM);
      rect(c, hx + hw, hy + 3, 1, 2, SKM);
      if (pointy) {
        rect(c, hx - 2, hy + 2, 1, 1, SKM);
        rect(c, hx + hw + 1, hy + 2, 1, 1, SKM);
      }
    }
  }
  // Mandibula marcada de los orcos.
  if (g.shape.race === 'orco' && !v.back) rect(c, hx + 1, hy + 5, hw - 2, 1, SKD);
}

// ------------------------------------------------------------------ cara
interface FaceStyle {
  eyeH: number;
  brow: 'none' | 'flat' | 'angry' | 'soft';
  mouth: number;
  nose: boolean;
  cheeks: boolean;
}

/** Variantes de cara (indice de Appearance.face). */
const FACES: FaceStyle[] = [
  { eyeH: 1, brow: 'flat', mouth: 1, nose: false, cheeks: false },
  { eyeH: 1, brow: 'angry', mouth: 2, nose: true, cheeks: false },
  { eyeH: 2, brow: 'soft', mouth: 1, nose: false, cheeks: true },
  { eyeH: 1, brow: 'none', mouth: 3, nose: true, cheeks: false },
  { eyeH: 2, brow: 'flat', mouth: 2, nose: true, cheeks: false },
  { eyeH: 1, brow: 'soft', mouth: 1, nose: true, cheeks: true },
  { eyeH: 2, brow: 'angry', mouth: 3, nose: false, cheeks: false },
  { eyeH: 1, brow: 'flat', mouth: 2, nose: false, cheeks: true },
];

export function drawFace(c: Ctx, g: Geom, face: number): void {
  if (g.lying || g.v.back) return;
  const f = FACES[face % FACES.length] as FaceStyle;
  const { hx, hy, hw, v } = g;
  const eyeY = hy + 3;
  if (v.side) {
    rect(c, hx + hw - 2, eyeY, 1, f.eyeH, KEY.eyes);
    if (f.brow !== 'none') rect(c, hx + hw - 3, eyeY - 1, 2, 1, HD);
    if (f.nose) rect(c, hx + hw, eyeY + 1, 1, 1, SKM);
    rect(c, hx + hw - 2, hy + 5, f.mouth > 1 ? 2 : 1, 1, SKD);
    return;
  }
  const lx = hx + 2 + v.fx;
  const rx = hx + hw - 3 + v.fx;
  rect(c, lx, eyeY, 1, f.eyeH, KEY.eyes);
  rect(c, rx, eyeY, 1, f.eyeH, KEY.eyes);
  if (g.shape.sex === 'f') {
    // Pestanas y labios.
    rect(c, lx - 1, eyeY - 1, 1, 1, '#1a1014');
    rect(c, rx + 1, eyeY - 1, 1, 1, '#1a1014');
  }
  if (f.brow === 'flat') {
    rect(c, lx - 1, eyeY - 1, 2, 1, HD);
    rect(c, rx, eyeY - 1, 2, 1, HD);
  } else if (f.brow === 'angry') {
    rect(c, lx, eyeY - 1, 1, 1, HD);
    rect(c, lx + 1, eyeY - 1, 1, 1, HM);
    rect(c, rx, eyeY - 1, 1, 1, HD);
    rect(c, rx - 1, eyeY - 1, 1, 1, HM);
  } else if (f.brow === 'soft') {
    rect(c, lx, eyeY - 1, 1, 1, HM);
    rect(c, rx, eyeY - 1, 1, 1, HM);
  }
  const mid = hx + Math.floor(hw / 2) + v.fx;
  if (f.nose) rect(c, mid - 1, eyeY + 1, 1, 1, SKM);
  const mouth = g.shape.sex === 'f' ? '#a8404a' : SKD;
  rect(c, mid - Math.floor(f.mouth / 2) - (f.mouth === 1 ? 1 : 0), hy + 5, f.mouth, 1, mouth);
  if (f.cheeks) {
    rect(c, lx - 1, eyeY + 2, 1, 1, SKM);
    rect(c, rx + 1, eyeY + 2, 1, 1, SKM);
  }
}

// ------------------------------------------------------------------ rasgos
export function drawFeature(c: Ctx, g: Geom, feature: string): void {
  if (g.lying || feature === 'ninguno') return;
  const { hx, hy, hw, v } = g;
  const front = !v.back;
  const mid = hx + Math.floor(hw / 2) + (v.side ? 2 : v.fx);
  switch (feature) {
    case 'bigote':
      if (front) rect(c, mid - 2, hy + 4, v.side ? 2 : 4, 1, HM);
      break;
    case 'barba_corta':
      if (front) {
        rect(c, hx + (v.side ? 2 : 0), hy + 5, v.side ? hw - 2 : hw, 2, HM);
        rect(c, hx + 1 + (v.side ? 2 : 0), hy + 7, v.side ? hw - 4 : hw - 2, 1, HD);
        rect(c, mid - 1, hy + 5, 2, 1, SKD);
      }
      break;
    case 'barba_larga':
      if (front) {
        rect(c, hx + (v.side ? 2 : 0), hy + 4, v.side ? hw - 2 : hw, 3, HM);
        rect(c, mid - 2, hy + 7, 4, 4, HM);
        rect(c, mid - 1, hy + 11, 2, 2, HD);
        rect(c, mid - 1, hy + 5, 2, 1, SKD);
      }
      break;
    case 'perilla':
      if (front) rect(c, mid - 1, hy + 6, 2, 3, HM);
      break;
    case 'patillas':
      if (!v.back) {
        rect(c, hx, hy + 2, 1, 4, HM);
        if (!v.side) rect(c, hx + hw - 1, hy + 2, 1, 4, HM);
      }
      break;
    case 'barba_trenzada':
      if (front) {
        rect(c, hx + 1, hy + 5, hw - 2, 2, HM);
        rect(c, mid - 1, hy + 7, 2, 6, HD);
        rect(c, mid - 1, hy + 13, 2, 1, '#c8a040');
      }
      break;
    case 'pecas':
      if (front && !v.side) {
        rect(c, hx + 1 + v.fx, hy + 4, 1, 1, SKD);
        rect(c, hx + 3 + v.fx, hy + 5, 1, 1, SKD);
        rect(c, hx + hw - 2 + v.fx, hy + 4, 1, 1, SKD);
      }
      break;
    case 'lunar':
      if (front) rect(c, hx + hw - 2 + (v.side ? 0 : v.fx), hy + 5, 1, 1, '#3a2014');
      break;
    case 'cicatriz':
      if (front) line(c, hx + 2 + v.fx, hy + 1, hx + 3 + v.fx, hy + 5, '#d88a8a');
      break;
    case 'colmillos':
      if (front && !v.side) {
        rect(c, hx + 2 + v.fx, hy + 4, 1, 1, '#f4f0e0');
        rect(c, hx + hw - 3 + v.fx, hy + 4, 1, 1, '#f4f0e0');
      } else if (v.side) rect(c, hx + hw - 1, hy + 4, 1, 1, '#f4f0e0');
      break;
    case 'colmillos_grandes':
      if (front && !v.side) {
        rect(c, hx + 2 + v.fx, hy + 3, 1, 2, '#f4f0e0');
        rect(c, hx + hw - 3 + v.fx, hy + 3, 1, 2, '#f4f0e0');
      } else if (v.side) rect(c, hx + hw - 1, hy + 3, 1, 2, '#f4f0e0');
      break;
    case 'pintura_guerra':
      if (front) {
        rect(c, hx + (v.side ? 2 : 0), hy + 2, v.side ? hw - 2 : hw, 1, '#8a1a1a');
        rect(c, mid - 1, hy + 1, 1, 4, '#8a1a1a');
      }
      break;
    case 'aro_nariz':
      if (front) rect(c, mid - 1 + (v.side ? 1 : 0), hy + 5, 1, 1, '#f2c14e');
      break;
  }
}

// ------------------------------------------------------------------ pelo
/** Peinado por id de HAIR_STYLES. Todo en los tonos clave del pelo. */
export function drawHair(c: Ctx, g: Geom, style: number): void {
  const { hx, hy, hw, v } = g;
  if (g.lying) {
    if (style === 14) return;
    rect(c, 2, 30, 3, 6, HM);
    if (style === 5 || style === 6 || style === 8 || style === 13) rect(c, 0, 32, 2, 6, HD);
    return;
  }
  const top = (rows: number) => rect(c, hx, hy - 1, hw, rows, HM);
  const highlight = () => rect(c, hx + 1, hy - 1, hw - 3, 1, HL);
  const backFill = (h: number) => {
    if (v.back) rect(c, hx, hy, hw, h, HM);
  };
  const sides = (len: number, color: string = HM) => {
    if (v.side) {
      rect(c, hx, hy, 3, len, color);
    } else {
      rect(c, hx - 1, hy, 1, len, color);
      rect(c, hx + hw, hy, 1, len, color);
      if (!v.back) {
        rect(c, hx, hy, 1, Math.min(len, 3), color);
        rect(c, hx + hw - 1, hy, 1, Math.min(len, 3), color);
      }
    }
  };
  switch (style) {
    case 14: // calvo
      return;
    case 0: // rapado
      rect(c, hx, hy, hw, 1, HD);
      if (v.back) rect(c, hx, hy, hw, 3, HD);
      return;
    case 1: // corto
      top(3);
      highlight();
      sides(3);
      backFill(5);
      return;
    case 2: // despeinado
      top(3);
      for (let i = 0; i < hw; i += 2) rect(c, hx + i, hy - 2, 1, 1, HM);
      rect(c, hx + 1, hy + 2, 2, 1, HD);
      highlight();
      sides(4);
      backFill(5);
      return;
    case 3: // raya al lado
      top(3);
      rect(c, hx + 2, hy - 1, 1, 1, HD);
      if (!v.back) rect(c, hx, hy + 2, Math.ceil(hw / 2), 1, HM);
      highlight();
      sides(4);
      backFill(5);
      return;
    case 4: // media melena
      top(3);
      highlight();
      sides(7);
      backFill(8);
      return;
    case 5: // melena larga
      top(3);
      highlight();
      sides(11);
      if (v.back) rect(c, hx - 1, hy, hw + 2, 12, HM);
      if (!v.side && !v.back) {
        rect(c, hx - 2, hy + 6, 1, 5, HD);
        rect(c, hx + hw + 1, hy + 6, 1, 5, HD);
      }
      return;
    case 6: // coleta
      top(3);
      highlight();
      sides(3);
      backFill(6);
      if (v.side) rect(c, hx - 2, hy + 2, 2, 8, HD);
      else if (v.back) rect(c, hx + Math.floor(hw / 2) - 1, hy + 4, 2, 7, HD);
      return;
    case 7: // mono
      top(3);
      highlight();
      sides(3);
      backFill(5);
      rect(c, hx + Math.floor(hw / 2) - 2, hy - 4, 4, 3, HM);
      rect(c, hx + Math.floor(hw / 2) - 1, hy - 4, 2, 1, HL);
      return;
    case 8: // trenzas
      top(3);
      highlight();
      sides(4);
      backFill(6);
      if (!v.back) {
        line(c, hx - 1, hy + 4, hx - 1, hy + 12, HD);
        if (!v.side) line(c, hx + hw, hy + 4, hx + hw, hy + 12, HD);
      } else {
        line(c, hx + 2, hy + 6, hx + 2, hy + 12, HD);
        line(c, hx + hw - 3, hy + 6, hx + hw - 3, hy + 12, HD);
      }
      return;
    case 9: {
      // cresta
      const m = hx + Math.floor(hw / 2) - 1 + (v.side ? 0 : v.fx);
      rect(c, m, hy - 4, 2, 5, HM);
      rect(c, m, hy - 4, 1, 4, HL);
      if (v.back || v.side) rect(c, m, hy, 2, 5, HM);
      return;
    }
    case 10: // pinchos
      top(2);
      for (let i = 0; i < hw; i += 2) rect(c, hx + i, hy - 3, 1, 2, i % 4 === 0 ? HL : HM);
      sides(3);
      backFill(4);
      return;
    case 11: // flequillo
      top(3);
      highlight();
      if (!v.back) rect(c, hx, hy + 1, v.side ? hw - 2 : hw, 2, HM);
      sides(6);
      backFill(7);
      return;
    case 12: // dos coletas
      top(3);
      highlight();
      sides(3);
      backFill(5);
      if (!v.side) {
        rect(c, hx - 3, hy + 1, 2, 6, HD);
        rect(c, hx + hw + 1, hy + 1, 2, 6, HD);
      } else rect(c, hx - 2, hy + 1, 2, 6, HD);
      return;
    case 13: // cola alta
      top(3);
      highlight();
      sides(3);
      backFill(5);
      if (v.side) line(c, hx, hy - 1, hx - 3, hy + 8, HD);
      else if (v.back) rect(c, hx + Math.floor(hw / 2) - 1, hy - 2, 2, 11, HD);
      else rect(c, hx + Math.floor(hw / 2) - 1, hy - 3, 2, 2, HD);
      return;
    default:
      top(3);
  }
}

// ------------------------------------------------------------------ equipo inicial
interface Gear {
  main: string;
  dark: string;
  trim: string;
  robe: boolean;
  pads: boolean;
}

export function gearFor(cls: ClassId, fac: FactionId): Gear {
  const f = FACTIONS[fac].colors;
  const trim = `#${f.primary.toString(16).padStart(6, '0')}`;
  if (cls === 'mago') {
    return fac === 'luz'
      ? { main: '#e9ecf5', dark: '#4f8fe0', trim, robe: true, pads: false }
      : { main: '#5a2d78', dark: '#24122f', trim: '#a02a3a', robe: true, pads: false };
  }
  return fac === 'luz'
    ? { main: '#b8c2cc', dark: '#5b6470', trim, robe: false, pads: true }
    : { main: '#4a4250', dark: '#24202a', trim: '#a02a3a', robe: false, pads: true };
}

/** Ropa y armadura iniciales de la clase (por encima del cuerpo). */
export function drawGear(c: Ctx, g: Geom, gear: Gear): void {
  if (g.lying) {
    rect(c, 8, 32, 13, 5, gear.main);
    rect(c, 8, 35, 13, 1, gear.dark);
    rect(c, 21, 33, 6, 3, gear.robe ? gear.main : gear.dark);
    return;
  }
  const { v, pose, cx, tx, ty, tw } = g;
  if (gear.robe) {
    for (let i = 0; i < 16 - g.kneel; i++) {
      const w = tw + Math.floor(i / 4);
      rect(c, cx - Math.floor(w / 2), ty + i, w, 1, i > 11 ? gear.dark : gear.main);
    }
    rect(c, cx - 1, ty + 1, 2, 12 - g.kneel, gear.trim);
    rect(c, cx - 3 + (v.side ? pose.leg : 0), 36 + Math.min(0, g.oy), 3, 1, '#2a1a10');
    rect(c, cx + 1 - (v.side ? pose.leg : 0), 36 + Math.min(0, g.oy), 3, 1, '#2a1a10');
  } else {
    // Pantalones y botas.
    const legH = g.legH;
    if (v.side) {
      rect(c, cx - 2 + pose.leg, g.legTop, 3, legH - Math.max(0, pose.leg), gear.dark);
      rect(c, cx - 1 - pose.leg, g.legTop, 3, legH - Math.max(0, -pose.leg), gear.dark);
      rect(c, cx - 2 + pose.leg, g.legTop + legH - 2, 4, 2, '#3a2a1a');
    } else {
      const b = g.shape.bulk;
      rect(c, cx - 4 - b, g.legTop, 3, legH - Math.max(0, pose.leg), gear.dark);
      rect(c, cx + 1 + b, g.legTop, 3, legH - Math.max(0, -pose.leg), gear.dark);
      rect(c, cx - 4 - b, g.legTop + legH - 2 - Math.max(0, pose.leg), 3, 2, '#3a2a1a');
      rect(c, cx + 1 + b, g.legTop + legH - 2 - Math.max(0, -pose.leg), 3, 2, '#3a2a1a');
    }
    // Cota y tabardo (siguiendo la silueta del torso).
    torso(c, g, (i) => (i === 7 || i >= 8 ? gear.dark : gear.main));
    if (!v.back) rect(c, cx - 1, ty + 1, 2, 9, gear.trim);
  }
  if (gear.pads) {
    rect(c, tx - 2, ty - 1, 4, 3, gear.trim);
    if (!v.side) rect(c, tx + tw - 2, ty - 1, 4, 3, gear.trim);
  }
  // Mangas sobre los brazos (las manos siguen siendo piel).
  const sleeve = gear.robe ? gear.main : gear.dark;
  if (pose.raise > 0) {
    const up = Math.round(pose.raise * 3);
    rect(c, tx - 2, ty - 3 - up, 2, 6, sleeve);
    rect(c, tx + tw, ty - 3 - up, 2, 6, sleeve);
  } else if (v.side) {
    rect(c, cx - 1 + pose.arm, ty + 1, 2, 6, sleeve);
  } else {
    rect(c, tx - 2, ty + 1 + pose.arm, 2, 6, sleeve);
    rect(c, tx + tw, ty + 1 - pose.arm, 2, 6, sleeve);
  }
}

/** Sombrero de mago (por encima del pelo). */
export function drawHat(c: Ctx, g: Geom, gear: Gear): void {
  if (g.lying) {
    rect(c, 0, 29, 5, 3, gear.dark);
    return;
  }
  const { hx, hy, hw } = g;
  rect(c, hx - 2, hy - 1, hw + 4, 2, gear.dark);
  for (let i = 0; i < 7; i++) {
    const w = Math.max(1, hw - i - 1);
    rect(c, hx + Math.floor((hw - w) / 2) + (i > 4 ? 1 : 0), hy - 2 - i, w, 1, gear.dark);
  }
  rect(c, hx, hy - 2, hw, 1, gear.trim);
}

export function drawHeldWeapon(c: Ctx, g: Geom, cls: ClassId, gear: Gear): void {
  const glow = cls === 'mago' ? (gear.main === '#e9ecf5' ? '#7fd8ff' : '#c86bff') : '#ffffff';
  if (g.lying) {
    if (cls === 'mago') line(c, 6, 38, 24, 37, '#7a5230');
    else line(c, 10, 38, 22, 38, '#c8d0d8');
    return;
  }
  drawWeapon(
    c,
    cls === 'mago' ? 'staff' : 'sword',
    gear.trim,
    glow,
    g.handX,
    g.handY,
    g.pose,
    g.side,
  );
}
