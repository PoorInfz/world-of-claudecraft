import type {
  AbilityDef,
  AuraDef,
  BaseStats,
  ClassDef,
  FactionId,
  MobDef,
  School,
} from '../../shared/data/types.ts';
import type { Vec2 } from '../../shared/iso.ts';
import type { EntityKind, InventoryItem } from '../../shared/protocol.ts';

/** Estado de servidor de las entidades de una zona. Nunca sale tal cual al cliente. */

export interface ActiveAura {
  def: AuraDef;
  left: number;
  srcId: number;
  tickAcc: number;
}

export interface CastState {
  ability: AbilityDef;
  targetId: number | null;
  point: Vec2 | null;
  left: number;
  total: number;
}

/** Desplazamiento forzado (carga): ignora rutas y velocidad normal. */
export interface Dash {
  x: number;
  y: number;
  speed: number;
  onArrive?: () => void;
}

export interface BaseEntity {
  id: number;
  kind: EntityKind;
  name: string;
  x: number;
  y: number;
  dir: number;
  level: number;
  hp: number;
  mhp: number;
  dead: boolean;
  auras: ActiveAura[];
  path: Vec2[];
  dash: Dash | null;
  /** Objetivo seleccionado (marco de objetivo). */
  targetId: number;
  cast: CastState | null;
  swingTimer: number;
  /** Segundos restantes "en combate". */
  combatTimer: number;
  /** Clave de celda AOI actual. */
  cell: number;
}

export interface PlayerEntity extends BaseEntity {
  kind: 'player';
  cls: ClassDef;
  faction: FactionId;
  stats: BaseStats;
  res: number;
  mres: number;
  gold: number;
  inv: InventoryItem[];
  invDirty: boolean;
  cds: Map<string, number>;
  gcd: number;
  /** Objetivo de autoataque (persecucion estilo Diablo). */
  attackId: number | null;
  /** Habilidad pendiente de entrar en alcance. */
  pending: { ability: AbilityDef; targetId: number } | null;
  /** Botin pendiente de alcanzar. */
  pendingLoot: number | null;
  repathTimer: number;
  /** Segundos desde el ultimo gasto de mana (regla de los 5 s). */
  sinceManaSpent: number;
  regenAcc: number;
  respawnTimer: number;
}

export type MobState = 'idle' | 'combat' | 'evade';

export interface MobEntity extends BaseEntity {
  kind: 'mob';
  def: MobDef;
  homeX: number;
  homeY: number;
  spawnIndex: number;
  state: MobState;
  threat: Map<number, number>;
  /** Primer jugador que le hizo dano: dueno del botin. */
  tagger: number | null;
  wanderTimer: number;
  scanTimer: number;
  repathTimer: number;
  spellCds: Map<string, number>;
  retreatTimer: number;
  corpseTimer: number;
}

export interface LootEntity extends BaseEntity {
  kind: 'loot';
  ownerId: number;
  copper: number;
  items: InventoryItem[];
  ttl: number;
}

export interface ProjectileEntity extends BaseEntity {
  kind: 'proj';
  srcId: number;
  victimId: number;
  speed: number;
  ability: AbilityDef | null;
  school: School;
  /** Dano precalculado (ataques basicos a distancia). */
  basic: { min: number; max: number } | null;
}

export type Entity = PlayerEntity | MobEntity | LootEntity | ProjectileEntity;
export type Unit = PlayerEntity | MobEntity;

export function isUnit(e: Entity | undefined): e is Unit {
  return !!e && (e.kind === 'player' || e.kind === 'mob');
}

export function baseFields(
  id: number,
  kind: EntityKind,
  name: string,
  x: number,
  y: number,
): BaseEntity {
  return {
    id,
    kind,
    name,
    x,
    y,
    dir: 0,
    level: 1,
    hp: 1,
    mhp: 1,
    dead: false,
    auras: [],
    path: [],
    dash: null,
    targetId: 0,
    cast: null,
    swingTimer: 0,
    combatTimer: 0,
    cell: -1,
  };
}

/** Suma de modificadores de auras. */
export function auraSum(e: BaseEntity, key: 'attackPower' | 'armor'): number {
  let s = 0;
  for (const a of e.auras) s += a.def[key] ?? 0;
  return s;
}

export function auraMult(e: BaseEntity, key: 'speedMult' | 'damageTakenMult'): number {
  let m = 1;
  for (const a of e.auras) m *= a.def[key] ?? 1;
  return m;
}

export function isStunned(e: BaseEntity): boolean {
  return e.auras.some((a) => a.def.stun);
}

export function isRooted(e: BaseEntity): boolean {
  return e.auras.some((a) => a.def.root || a.def.stun);
}

export function distTo(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
