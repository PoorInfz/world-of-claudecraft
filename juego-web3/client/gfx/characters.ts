import type Phaser from 'phaser';
import type { ClassId, FactionId } from '../../shared/data/types.ts';

/**
 * Generador de spritesheets de personajes en pixel art (placeholders).
 *
 * Rejilla comun a TODAS las capas y personajes: 8 filas (direcciones, en el
 * orden de shared/iso DIRECTIONS) x 24 columnas (fotogramas de animacion).
 * Cada fotograma se dibuja por CAPAS (sombra, piernas, torso, cabeza,
 * pelo/sombrero, arma) a partir de una "pose" calculada una sola vez por
 * fotograma, asi que todas las capas quedan alineadas frame a frame.
 * Para usar arte real basta con cargar una hoja con la misma rejilla y la
 * misma clave de textura: la logica de animacion no cambia.
 */

export const FRAME_W = 32;
export const FRAME_H = 40;
/** Punto de apoyo (pies) dentro del fotograma. */
export const FOOT_X = 16;
export const FOOT_Y = 37;

export type AnimName = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'death';

export const ANIMS: Record<
  AnimName,
  { start: number; count: number; fps: number; repeat: number }
> = {
  idle: { start: 0, count: 4, fps: 4, repeat: -1 },
  walk: { start: 4, count: 6, fps: 10, repeat: -1 },
  attack: { start: 10, count: 4, fps: 12, repeat: 0 },
  cast: { start: 14, count: 4, fps: 8, repeat: -1 },
  hit: { start: 18, count: 2, fps: 10, repeat: 0 },
  death: { start: 20, count: 4, fps: 8, repeat: 0 },
};
export const FRAMES_PER_DIR = 24;

export interface Look {
  body: 'humanoid' | 'quadruped';
  skin: string;
  hair: string;
  eyes: string;
  armor: string;
  armorDark: string;
  trim: string;
  weapon: 'sword' | 'staff' | 'bow' | 'none';
  glow: string;
  hat?: boolean;
  hood?: boolean;
  robe?: boolean;
  skeleton?: boolean;
  pads?: boolean;
  /** Proporciones: algunas razas son mas anchas. */
  bulk?: number;
}

/** Aspecto por defecto: la Luz usa humanos, la Sombra orcos (hasta la Fase 2). */
export const LOOKS: Record<string, Look> = {
  guerrero_luz: {
    body: 'humanoid',
    skin: '#e8b98e',
    hair: '#7a4a22',
    eyes: '#2b3a67',
    armor: '#b8c2cc',
    armorDark: '#5b6470',
    trim: '#f2c14e',
    weapon: 'sword',
    glow: '#fff4d6',
    pads: true,
  },
  guerrero_sombra: {
    body: 'humanoid',
    skin: '#6f9a4a',
    hair: '#1d1a17',
    eyes: '#c0302a',
    armor: '#4a4250',
    armorDark: '#24202a',
    trim: '#a02a3a',
    weapon: 'sword',
    glow: '#ff5a4a',
    pads: true,
    bulk: 1,
  },
  mago_luz: {
    body: 'humanoid',
    skin: '#f0c9a0',
    hair: '#e8d27a',
    eyes: '#2b5aa0',
    armor: '#e9ecf5',
    armorDark: '#4f8fe0',
    trim: '#f2c14e',
    weapon: 'staff',
    glow: '#7fd8ff',
    hat: true,
    robe: true,
  },
  mago_sombra: {
    body: 'humanoid',
    skin: '#7aa356',
    hair: '#2a1631',
    eyes: '#ffcf3a',
    armor: '#5a2d78',
    armorDark: '#24122f',
    trim: '#a02a3a',
    weapon: 'staff',
    glow: '#c86bff',
    hat: true,
    robe: true,
  },
  lobo: {
    body: 'quadruped',
    skin: '#8a8f96',
    hair: '#5c6168',
    eyes: '#ffd23a',
    armor: '#8a8f96',
    armorDark: '#4a4f56',
    trim: '#e6e6e6',
    weapon: 'none',
    glow: '#ffffff',
  },
  esqueleto: {
    body: 'humanoid',
    skin: '#e6e0cc',
    hair: '#e6e0cc',
    eyes: '#ff4a2a',
    armor: '#d6cfb8',
    armorDark: '#8a8270',
    trim: '#5a4a32',
    weapon: 'bow',
    glow: '#ff4a2a',
    skeleton: true,
  },
  cultista: {
    body: 'humanoid',
    skin: '#c79a7a',
    hair: '#1a1020',
    eyes: '#b84aff',
    armor: '#3a1f48',
    armorDark: '#1e0f28',
    trim: '#8a2a5a',
    weapon: 'staff',
    glow: '#b84aff',
    hood: true,
    robe: true,
  },
};

export function playerLookKey(cls: ClassId, fac: FactionId): string {
  return `${cls}_${fac}`;
}

export function mobLookKey(palette: string): string {
  return palette;
}

export function sheetKey(look: string): string {
  return `chr_${look}`;
}

// ------------------------------------------------------------------ poses
interface Pose {
  bob: number;
  leg: number;
  arm: number;
  /** Giro del arma respecto a reposo (radianes, positivo = hacia delante). */
  swing: number;
  lunge: number;
  raise: number;
  glow: number;
  lean: number;
  down: number;
}

function poseFor(anim: AnimName, f: number): Pose {
  const p: Pose = {
    bob: 0,
    leg: 0,
    arm: 0,
    swing: 0,
    lunge: 0,
    raise: 0,
    glow: 0,
    lean: 0,
    down: 0,
  };
  switch (anim) {
    case 'idle':
      p.bob = [0, 0, 1, 1][f] ?? 0;
      break;
    case 'walk': {
      const s = Math.sin((f / 6) * Math.PI * 2);
      p.leg = Math.round(s * 2);
      p.arm = -Math.round(s);
      p.bob = Math.abs(Math.round(s)) === 1 ? 0 : 1;
      break;
    }
    case 'attack':
      p.swing = [-0.9, 1.4, 2.0, 0.6][f] ?? 0;
      p.lunge = [0, 2, 2, 1][f] ?? 0;
      break;
    case 'cast':
      p.raise = [0.6, 1, 1, 1][f] ?? 0;
      p.glow = [0, 1, 2, 1][f] ?? 0;
      p.bob = [0, 0, 1, 0][f] ?? 0;
      break;
    case 'hit':
      p.lean = [2, 1][f] ?? 0;
      break;
    case 'death':
      p.down = [0.2, 0.5, 0.85, 1][f] ?? 1;
      break;
  }
  return p;
}

// ------------------------------------------------------------------ dibujo
type Ctx = CanvasRenderingContext2D;

function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, color: string): void {
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

function shadow(c: Ctx, w = 14): void {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  const half = w / 2;
  c.fillRect(FOOT_X - half + 2, FOOT_Y - 1, w - 4, 3);
  c.fillRect(FOOT_X - half, FOOT_Y, w, 1);
}

/** Vista desde la direccion autorizada (solo S, SE, E, NE, N; el resto se refleja). */
type View = { front: boolean; back: boolean; side: boolean; fx: number };

function viewFor(dir: number): View {
  switch (dir) {
    case 0:
      return { front: true, back: false, side: false, fx: 0 };
    case 7:
      return { front: true, back: false, side: false, fx: 1 };
    case 6:
      return { front: false, back: false, side: true, fx: 1 };
    case 5:
      return { front: false, back: true, side: false, fx: 1 };
    default:
      return { front: false, back: true, side: false, fx: 0 };
  }
}

function drawWeapon(c: Ctx, look: Look, hx: number, hy: number, pose: Pose, side: number): void {
  if (look.weapon === 'sword') {
    const a = -Math.PI / 2 + side * (0.45 + pose.swing);
    const len = 11;
    const tx = hx + Math.cos(a) * len;
    const ty = hy + Math.sin(a) * len;
    line(c, hx, hy, tx, ty, '#e8edf2');
    line(c, hx + 1, hy, tx + 1, ty, '#9aa4ae');
    // Guarda y empunadura.
    const gx = Math.cos(a + Math.PI / 2) * 2;
    const gy = Math.sin(a + Math.PI / 2) * 2;
    line(c, hx - gx, hy - gy, hx + gx, hy + gy, look.trim);
  } else if (look.weapon === 'staff') {
    const lift = Math.round(pose.raise * 5);
    const x = Math.round(hx);
    line(c, x, hy - 9 - lift, x, hy + 8 - lift, '#7a5230');
    rect(c, x - 1, hy - 12 - lift, 3, 3, look.glow);
    if (pose.glow) {
      c.fillStyle = look.glow;
      for (let i = 0; i < pose.glow * 2; i++)
        c.fillRect(x - 2 + ((i * 3) % 5), hy - 15 - lift - (i % 2), 1, 1);
    }
  } else if (look.weapon === 'bow') {
    const x = Math.round(hx + side);
    line(c, x, hy - 6, x + side * 2, hy - 3, '#7a5230');
    line(c, x + side * 2, hy - 3, x + side * 2, hy + 3, '#7a5230');
    line(c, x + side * 2, hy + 3, x, hy + 6, '#7a5230');
    const pull = pose.swing > 1 ? -side * 2 : 0;
    line(c, x, hy - 6, x + pull, hy, '#ddd');
    line(c, x + pull, hy, x, hy + 6, '#ddd');
  }
}

function drawHumanoid(c: Ctx, look: Look, dir: number, pose: Pose): void {
  const v = viewFor(dir);
  if (pose.down >= 0.85) {
    drawLying(c, look, pose.down >= 1);
    return;
  }
  const kneel = pose.down >= 0.5 ? 5 : pose.down > 0 ? 1 : 0;
  const dy = pose.bob + kneel;
  const lx = v.side ? pose.lunge : 0;
  const ly = v.front ? pose.lunge : v.back ? -pose.lunge : 0;
  const bulk = look.bulk ?? 0;
  const ox = lx - (v.side ? pose.lean : 0);
  const oy = ly + dy - (v.front ? pose.lean : 0);
  const cx = FOOT_X + ox;

  shadow(c);

  // Piernas.
  const legTop = 29 + oy;
  const legH = Math.max(2, 8 - kneel);
  if (!look.robe) {
    const pants = look.skeleton ? look.skin : look.armorDark;
    if (v.side) {
      rect(c, cx - 2 + pose.leg, legTop, 3, legH - Math.max(0, pose.leg), pants);
      rect(c, cx - 1 - pose.leg, legTop, 3, legH - Math.max(0, -pose.leg), pants);
      rect(c, cx - 2 + pose.leg, legTop + legH - 2, 4, 2, '#3a2a1a');
    } else {
      rect(c, cx - 4 - bulk, legTop, 3, legH - Math.max(0, pose.leg), pants);
      rect(c, cx + 1 + bulk, legTop, 3, legH - Math.max(0, -pose.leg), pants);
      rect(c, cx - 4 - bulk, legTop + legH - 2 - Math.max(0, pose.leg), 3, 2, '#3a2a1a');
      rect(c, cx + 1 + bulk, legTop + legH - 2 - Math.max(0, -pose.leg), 3, 2, '#3a2a1a');
    }
  } else {
    // Tunica larga: solo asoman los pies.
    rect(c, cx - 3 + (v.side ? pose.leg : 0), FOOT_Y - 1 + Math.min(0, oy), 3, 1, '#2a1a10');
    rect(c, cx + 1 - (v.side ? pose.leg : 0), FOOT_Y - 1 + Math.min(0, oy), 3, 1, '#2a1a10');
  }

  // Arma detras del cuerpo cuando mira hacia atras.
  const side = v.back ? -1 : 1;
  const handX = v.side ? cx + 3 : v.front ? cx + 6 + bulk : cx - 7 - bulk;
  const handY = 26 + oy - Math.round(pose.raise * 6) + (look.weapon === 'staff' ? 0 : pose.arm);
  if (v.back) drawWeapon(c, look, handX, handY, pose, side);

  // Torso (o tunica).
  const tw = v.side ? 7 : 10 + bulk * 2;
  const tx = cx - Math.floor(tw / 2);
  const ty = 19 + oy;
  if (look.robe) {
    for (let i = 0; i < 16 - kneel; i++) {
      const w = tw + Math.floor(i / 4);
      rect(c, cx - Math.floor(w / 2), ty + i, w, 1, i > 11 ? look.armorDark : look.armor);
    }
    rect(c, cx - 1, ty + 1, 2, 12 - kneel, look.trim);
  } else if (look.skeleton) {
    rect(c, tx + 1, ty, tw - 2, 10, look.armor);
    for (let i = 1; i < 9; i += 2) rect(c, tx + 2, ty + i, tw - 4, 1, look.armorDark);
    rect(c, cx - 1, ty, 1, 10, look.skin);
  } else {
    rect(c, tx, ty, tw, 10, look.armor);
    rect(c, tx, ty + 7, tw, 1, look.armorDark);
    if (!v.back) rect(c, cx - 1, ty + 1, 2, 9, look.trim);
    rect(c, tx, ty + 8, tw, 2, look.armorDark);
  }
  if (look.pads) {
    rect(c, tx - 2, ty - 1, 4, 3, look.trim);
    if (!v.side) rect(c, tx + tw - 2, ty - 1, 4, 3, look.trim);
  }

  // Brazos.
  const armColor = look.skeleton ? look.skin : look.robe ? look.armor : look.armorDark;
  if (pose.raise > 0) {
    rect(c, tx - 2, ty - 4 - Math.round(pose.raise * 3), 2, 7, armColor);
    rect(c, tx + tw, ty - 4 - Math.round(pose.raise * 3), 2, 7, armColor);
    rect(c, tx - 2, ty - 5 - Math.round(pose.raise * 3), 2, 1, look.skin);
    rect(c, tx + tw, ty - 5 - Math.round(pose.raise * 3), 2, 1, look.skin);
  } else if (v.side) {
    rect(c, cx - 1 + pose.arm, ty + 1, 2, 7, armColor);
  } else {
    rect(c, tx - 2, ty + 1 + pose.arm, 2, 7, armColor);
    rect(c, tx + tw, ty + 1 - pose.arm, 2, 7, armColor);
    rect(c, tx - 2, ty + 8 + pose.arm, 2, 1, look.skin);
    rect(c, tx + tw, ty + 8 - pose.arm, 2, 1, look.skin);
  }

  // Cabeza.
  const hw = v.side ? 7 : 8;
  const hx = cx - Math.floor(hw / 2) + (v.side ? 1 : 0) + v.fx * (v.side ? 0 : 1);
  const hy = 11 + oy;
  rect(c, hx, hy, hw, 7, look.skin);
  if (look.skeleton) {
    rect(c, hx + 1, hy + 6, hw - 2, 1, look.armorDark);
  }
  if (look.hood) {
    rect(c, hx - 1, hy - 2, hw + 2, 3, look.armor);
    rect(c, hx - 1, hy, 2, 7, look.armor);
    rect(c, hx + hw - 1, hy, 2, 7, look.armor);
    if (!v.back) rect(c, hx + 1, hy + 1, hw - 2, 4, '#140a18');
    else rect(c, hx, hy, hw, 7, look.armor);
  } else if (!look.skeleton) {
    // Pelo.
    rect(c, hx, hy - 1, hw, 3, look.hair);
    if (v.back) rect(c, hx, hy, hw, 6, look.hair);
    else if (v.side) rect(c, hx - 1, hy, 3, 5, look.hair);
  }
  // Ojos.
  if (!v.back) {
    const eyeY = hy + 3;
    if (v.side) {
      rect(c, hx + hw - 2, eyeY, 1, 1, look.eyes);
    } else {
      rect(c, hx + 2 + v.fx, eyeY, 1, 1, look.eyes);
      rect(c, hx + hw - 3 + v.fx, eyeY, 1, 1, look.eyes);
    }
    // Colmillos de orco (piel verde).
    if (look.skin.startsWith('#6f') || look.skin.startsWith('#7a')) {
      if (!v.side) {
        rect(c, hx + 2 + v.fx, hy + 6, 1, 1, '#f4f0e0');
        rect(c, hx + hw - 3 + v.fx, hy + 6, 1, 1, '#f4f0e0');
      }
    }
  }
  if (look.hat) {
    rect(c, hx - 2, hy - 1, hw + 4, 2, look.armorDark);
    for (let i = 0; i < 7; i++) {
      const w = Math.max(1, hw - i - 1);
      rect(c, hx + Math.floor((hw - w) / 2) + (i > 4 ? 1 : 0), hy - 2 - i, w, 1, look.armorDark);
    }
    rect(c, hx, hy - 2, hw, 1, look.trim);
  }

  if (!v.back) drawWeapon(c, look, handX, handY, pose, side);

  // Brillo del hechizo entre las manos.
  if (pose.glow && look.weapon !== 'staff') {
    c.fillStyle = look.glow;
    for (let i = 0; i < pose.glow * 3; i++)
      c.fillRect(cx - 3 + ((i * 5) % 7), ty - 6 - (i % 3), 1, 1);
  }
}

function drawLying(c: Ctx, look: Look, flat: boolean): void {
  shadow(c, 18);
  const y = flat ? 32 : 31;
  rect(c, 8, y, 13, 5, look.armor);
  rect(c, 8, y + 3, 13, 1, look.armorDark);
  rect(c, 21, y + 1, 6, 3, look.skeleton ? look.skin : look.armorDark);
  rect(c, 2, y - 1, 6, 6, look.hood ? look.armor : look.skin);
  if (!look.hood && !look.skeleton) rect(c, 2, y - 1, 2, 6, look.hair);
  if (look.weapon === 'sword') line(c, 10, y + 6, 22, y + 6, '#c8d0d8');
  if (look.weapon === 'staff') line(c, 6, y + 6, 24, y + 5, '#7a5230');
  if (look.weapon === 'bow') line(c, 12, y + 6, 20, y + 6, '#7a5230');
}

function drawQuadruped(c: Ctx, look: Look, dir: number, pose: Pose): void {
  const v = viewFor(dir);
  if (pose.down >= 0.85) {
    shadow(c, 20);
    rect(c, 6, 31, 16, 5, look.armor);
    rect(c, 6, 34, 16, 1, look.armorDark);
    rect(c, 22, 30, 6, 5, look.armor);
    rect(c, 26, 33, 3, 1, '#2a2a2a');
    line(c, 8, 36, 10, 38, look.armorDark);
    line(c, 18, 36, 20, 38, look.armorDark);
    rect(c, 3, 32, 3, 2, look.armorDark);
    return;
  }
  const oy = pose.bob + (pose.down > 0 ? 2 : 0) + pose.lean;
  shadow(c, v.side || v.fx ? 20 : 12);
  if (v.side || v.fx) {
    // Perfil (E, SE, NE): cuerpo alargado.
    const lunge = pose.lunge;
    const bx = 7 + lunge;
    const by = 25 + oy;
    // Cola.
    line(c, bx - 1, by + 1, bx - 4, by - 2 + (v.back ? -1 : 0), look.armorDark);
    rect(c, bx, by, 15, 6, look.armor);
    rect(c, bx, by + 5, 15, 1, look.armorDark);
    rect(c, bx + 2, by - 1, 10, 1, look.hair);
    // Patas.
    const legs = [bx + 1, bx + 4, bx + 10, bx + 13];
    legs.forEach((lx, i) => {
      const ph = i % 2 === 0 ? pose.leg : -pose.leg;
      rect(
        c,
        lx + Math.round(ph / 2),
        by + 6,
        2,
        6 - Math.max(0, ph > 0 ? 1 : 0),
        i < 2 ? look.armorDark : look.armor,
      );
    });
    // Cabeza.
    const hx = bx + 14;
    const hy = by - 4 + (v.back ? -1 : 0);
    rect(c, hx, hy, 6, 6, look.armor);
    rect(c, hx + 5, hy + 2, 4, 3, look.armor);
    rect(c, hx + 8, hy + 2, 1, 1, '#1a1a1a');
    if (pose.lunge > 0) rect(c, hx + 6, hy + 5, 3, 1, '#8a1a1a');
    rect(c, hx + 1, hy - 2, 2, 2, look.armorDark);
    rect(c, hx + 3, hy - 2, 2, 2, look.armorDark);
    if (!v.back) rect(c, hx + 4, hy + 1, 1, 1, look.eyes);
  } else if (v.front) {
    const by = 24 + oy + pose.lunge;
    rect(c, 12, by, 9, 9, look.armor);
    rect(c, 13, by + 9, 2, 4, look.armorDark);
    rect(c, 18, by + 9, 2, 4, look.armorDark);
    rect(c, 13 + Math.max(0, pose.leg), by + 11, 2, 2, look.armorDark);
    // Cabeza delante.
    rect(c, 12, by - 6, 9, 7, look.armor);
    rect(c, 14, by - 1, 5, 3, look.trim);
    rect(c, 16, by - 1, 1, 1, '#1a1a1a');
    rect(c, 12, by - 8, 2, 2, look.armorDark);
    rect(c, 19, by - 8, 2, 2, look.armorDark);
    rect(c, 14, by - 4, 1, 1, look.eyes);
    rect(c, 18, by - 4, 1, 1, look.eyes);
    if (pose.lunge > 0) rect(c, 15, by + 2, 3, 1, '#8a1a1a');
  } else {
    const by = 24 + oy - pose.lunge;
    rect(c, 12, by - 6, 9, 6, look.armor);
    rect(c, 12, by - 8, 2, 2, look.armorDark);
    rect(c, 19, by - 8, 2, 2, look.armorDark);
    rect(c, 12, by, 9, 9, look.armor);
    rect(c, 12, by, 9, 2, look.hair);
    rect(c, 13, by + 9, 2, 4, look.armorDark);
    rect(c, 18, by + 9, 2, 4, look.armorDark);
    line(c, 16, by + 8, 16 + pose.leg, by + 12, look.armorDark);
  }
}

/** Contorno oscuro de 1 px alrededor de los pixeles opacos (estilo pixel art). */
function outline(c: Ctx, w: number, h: number): void {
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

/** Direcciones que se dibujan reflejando otra (indice destino -> origen). */
const MIRROR: Record<number, number> = { 1: 7, 2: 6, 3: 5 };

function drawFrame(look: Look, dir: number, anim: AnimName, f: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = FRAME_W;
  cv.height = FRAME_H;
  const c = cv.getContext('2d', { willReadFrequently: true }) as Ctx;
  const src = MIRROR[dir];
  if (src !== undefined) {
    const other = drawFrame(look, src, anim, f);
    c.translate(FRAME_W, 0);
    c.scale(-1, 1);
    c.drawImage(other, 0, 0);
    return cv;
  }
  const pose = poseFor(anim, f);
  if (look.body === 'quadruped') drawQuadruped(c, look, dir, pose);
  else drawHumanoid(c, look, dir, pose);
  outline(c, FRAME_W, FRAME_H);
  return cv;
}

/** Genera y registra la hoja de un aspecto, con sus animaciones por direccion. */
export function buildSheet(scene: Phaser.Scene, lookKey: string): string {
  const key = sheetKey(lookKey);
  if (scene.textures.exists(key)) return key;
  const look = LOOKS[lookKey];
  if (!look) throw new Error(`Aspecto desconocido: ${lookKey}`);
  const sheet = document.createElement('canvas');
  sheet.width = FRAME_W * FRAMES_PER_DIR;
  sheet.height = FRAME_H * 8;
  const sc = sheet.getContext('2d') as Ctx;
  for (let dir = 0; dir < 8; dir++) {
    for (const [name, a] of Object.entries(ANIMS) as [AnimName, (typeof ANIMS)[AnimName]][]) {
      for (let f = 0; f < a.count; f++) {
        sc.drawImage(drawFrame(look, dir, name, f), (a.start + f) * FRAME_W, dir * FRAME_H);
      }
    }
  }
  const tex = scene.textures.addCanvas(key, sheet);
  if (!tex) throw new Error('No se pudo crear la hoja');
  for (let dir = 0; dir < 8; dir++) {
    for (let i = 0; i < FRAMES_PER_DIR; i++) {
      tex.add(dir * FRAMES_PER_DIR + i, 0, i * FRAME_W, dir * FRAME_H, FRAME_W, FRAME_H);
    }
  }
  for (let dir = 0; dir < 8; dir++) {
    for (const [name, a] of Object.entries(ANIMS)) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let f = 0; f < a.count; f++)
        frames.push({ key, frame: dir * FRAMES_PER_DIR + a.start + f });
      scene.anims.create({
        key: animKey(key, name as AnimName, dir),
        frames,
        frameRate: a.fps,
        repeat: a.repeat,
      });
    }
  }
  return key;
}

export function animKey(sheet: string, anim: AnimName, dir: number): string {
  return `${sheet}:${anim}:${dir}`;
}
