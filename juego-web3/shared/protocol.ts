import type { AppearanceWire } from './appearance.ts';
import type { ClassId, FactionId, School } from './data/types.ts';

/**
 * Protocolo cliente <-> servidor (JSON compacto sobre WebSocket).
 *
 * El cliente solo envia INTENCIONES (moverse a un punto, atacar a un id,
 * lanzar una habilidad, recoger un botin). El servidor valida todo y devuelve
 * instantaneas por area de interes 20 veces por segundo.
 */

// ---------------------------------------------------------------- cliente
export type ClientMsg =
  | { t: 'join'; token: string; char: number }
  | { t: 'move'; x: number; y: number }
  | { t: 'attack'; id: number }
  | { t: 'cast'; ab: string; id?: number; x?: number; y?: number }
  | { t: 'target'; id: number | null }
  | { t: 'pickup'; id: number }
  | { t: 'stop' }
  | { t: 'ping'; c: number };

// ---------------------------------------------------------------- servidor
export type EntityKind = 'player' | 'mob' | 'loot' | 'proj';

/** Datos estaticos de una entidad: se envian una vez al entrar en el AOI. */
export interface EntityInit {
  id: number;
  k: EntityKind;
  n: string;
  x: number;
  y: number;
  lvl: number;
  mhp: number;
  /** Jugador: clase, faccion y apariencia compacta. */
  cls?: ClassId;
  fac?: FactionId;
  ap?: AppearanceWire;
  /** Enemigo: id de MobDef. */
  mob?: string;
  /** Proyectil: escuela (para el color) e id de la habilidad. */
  sc?: School;
  ab?: string;
  /** Botin: id del jugador que puede recogerlo. */
  own?: number;
}

/** Bits de estado de una entidad en EntityUpdate[6]. */
export const FLAG = {
  moving: 1,
  dead: 2,
  casting: 4,
  combat: 8,
  stunned: 16,
  rooted: 32,
  slowed: 64,
} as const;

/** [id, x, y, hp, mhp, dir, flags, targetId (0 = ninguno), auras] */
export type EntityUpdate = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string[],
];

export type HitWire = 'miss' | 'dodge' | 'hit' | 'crit';

/** Codigos de error para el jugador. El cliente los traduce. */
export type ErrorCode =
  | 'fuera_alcance'
  | 'demasiado_cerca'
  | 'sin_recurso'
  | 'en_reutilizacion'
  | 'sin_objetivo'
  | 'objetivo_invalido'
  | 'no_puedes_ahora'
  | 'sin_linea'
  | 'botin_ajeno'
  | 'inventario_lleno'
  | 'sesion_invalida'
  | 'personaje_no_encontrado'
  | 'personaje_en_uso';

export type GameEvent =
  | { e: 'dmg'; s: number; t: number; a: number; sc: School; r: HitWire; ab?: string }
  | { e: 'heal'; s: number; t: number; a: number }
  | { e: 'swing'; s: number; t: number }
  | { e: 'cast'; s: number; ab: string; d: number }
  | { e: 'fx'; s: number; ab: string; x: number; y: number }
  | { e: 'die'; id: number }
  | { e: 'err'; code: ErrorCode }
  | { e: 'loot'; c: number; items: string[] };

export interface InventoryItem {
  item: string;
  qty: number;
}

/** Estado privado del propio jugador. */
export interface SelfState {
  hp: number;
  mhp: number;
  res: number;
  mres: number;
  /** Cobre total. */
  gold: number;
  /** Tiempo restante de reutilizacion por habilidad (s). */
  cds: Record<string, number>;
  gcd: number;
  /** Lanzamiento en curso. */
  cast: { ab: string; left: number; total: number } | null;
  auras: { id: string; left: number }[];
  /** Solo se envia cuando cambia. */
  inv?: InventoryItem[];
}

export type ServerMsg =
  | {
      t: 'welcome';
      id: number;
      zone: string;
      tick: number;
      tickRate: number;
      x: number;
      y: number;
    }
  | {
      t: 'snap';
      tick: number;
      add?: EntityInit[];
      upd?: EntityUpdate[];
      rem?: number[];
      ev?: GameEvent[];
      me?: SelfState;
    }
  | { t: 'pong'; c: number; tick: number }
  | { t: 'reject'; code: ErrorCode };
