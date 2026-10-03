/**
 * Rejilla de animacion y poses compartidas por TODAS las capas y personajes.
 * Una pose se calcula una vez por fotograma y cada capa dibuja a partir de
 * ella, asi que las capas quedan alineadas frame a frame en las 8 direcciones.
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

// ------------------------------------------------------------------ poses
export interface Pose {
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

export function poseFor(anim: AnimName, f: number): Pose {
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

/** Vista desde la direccion autorizada (solo S, SE, E, NE, N; el resto se refleja). */
export type View = { front: boolean; back: boolean; side: boolean; fx: number };

export function viewFor(dir: number): View {
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

/** Direcciones que se dibujan reflejando otra (indice destino -> origen). */
export const MIRROR: Record<number, number> = { 1: 7, 2: 6, 3: 5 };

/** Filas (direcciones) que miran hacia atras: el arma va detras del cuerpo. */
export const BACK_DIRS: ReadonlySet<number> = new Set([3, 4, 5]);

export function animKey(sheet: string, anim: AnimName, dir: number): string {
  return `${sheet}:${anim}:${dir}`;
}
