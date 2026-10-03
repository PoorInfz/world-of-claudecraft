import { AOI_RADIUS } from '../../shared/constants.ts';
import {
  type EntityInit,
  type EntityUpdate,
  FLAG,
  type GameEvent,
  type SelfState,
  type ServerMsg,
} from '../../shared/protocol.ts';
import { auraMult, type Entity, isRooted, isStunned, type PlayerEntity } from './entities.ts';

/** Destino de los mensajes de un jugador (el WebSocket real o un test). */
export interface Observer {
  send(msg: ServerMsg): void;
}

/** Evento pendiente de reparto con las entidades a las que concierne. */
export interface QueuedEvent {
  ev: GameEvent;
  anchors: number[];
  /** Si se indica, solo lo recibe ese jugador. */
  only?: number;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Area de interes de un jugador: que entidades conoce y que le enviamos por
 * ultima vez, para mandar solo altas, bajas y cambios.
 */
export class Interest {
  /** id -> ultima tupla enviada (serializada) */
  readonly known = new Map<number, string>();

  constructor(
    readonly playerId: number,
    readonly observer: Observer,
  ) {}
}

export function entityInit(e: Entity): EntityInit {
  const base: EntityInit = {
    id: e.id,
    k: e.kind,
    n: e.name,
    x: r2(e.x),
    y: r2(e.y),
    lvl: e.level,
    mhp: e.mhp,
  };
  switch (e.kind) {
    case 'player':
      base.cls = e.cls.id;
      base.fac = e.faction;
      break;
    case 'mob':
      base.mob = e.def.id;
      break;
    case 'proj':
      base.sc = e.school;
      if (e.ability) base.ab = e.ability.id;
      break;
    case 'loot':
      base.own = e.ownerId;
      break;
  }
  return base;
}

export function entityUpdate(e: Entity): EntityUpdate {
  let flags = 0;
  if (e.path.length > 0 || e.dash) flags |= FLAG.moving;
  if (e.dead) flags |= FLAG.dead;
  if (e.cast) flags |= FLAG.casting;
  if (e.combatTimer > 0 || (e.kind === 'mob' && e.state === 'combat')) flags |= FLAG.combat;
  if (isStunned(e)) flags |= FLAG.stunned;
  if (isRooted(e)) flags |= FLAG.rooted;
  if (auraMult(e, 'speedMult') < 1) flags |= FLAG.slowed;
  const auras = e.auras.length ? e.auras.map((a) => a.def.id) : [];
  return [e.id, r2(e.x), r2(e.y), Math.ceil(e.hp), e.mhp, e.dir, flags, e.targetId, auras];
}

export function selfState(p: PlayerEntity): SelfState {
  const cds: Record<string, number> = {};
  for (const [k, v] of p.cds) cds[k] = r2(v);
  const s: SelfState = {
    hp: Math.ceil(p.hp),
    mhp: p.mhp,
    res: Math.floor(p.res),
    mres: p.mres,
    gold: p.gold,
    cds,
    gcd: r2(p.gcd),
    cast: p.cast ? { ab: p.cast.ability.id, left: r2(p.cast.left), total: p.cast.total } : null,
    auras: p.auras.map((a) => ({ id: a.def.id, left: r2(a.left) })),
  };
  if (p.invDirty) {
    s.inv = p.inv.map((i) => ({ ...i }));
    p.invDirty = false;
  }
  return s;
}

/**
 * Construye y envia la instantanea de cada jugador. Las tuplas se serializan
 * una sola vez por entidad y tick, y se comparan con lo ultimo enviado.
 */
export function sendSnapshots(
  tick: number,
  interests: Iterable<Interest>,
  entities: Map<number, Entity>,
  around: (x: number, y: number, r: number) => Iterable<Entity>,
  events: QueuedEvent[],
): void {
  const tupleCache = new Map<number, { tuple: EntityUpdate; json: string }>();
  const tupleOf = (e: Entity): { tuple: EntityUpdate; json: string } => {
    let c = tupleCache.get(e.id);
    if (!c) {
      const tuple = entityUpdate(e);
      c = { tuple, json: JSON.stringify(tuple) };
      tupleCache.set(e.id, c);
    }
    return c;
  };

  for (const it of interests) {
    const p = entities.get(it.playerId);
    if (p?.kind !== 'player') continue;
    const add: EntityInit[] = [];
    const upd: EntityUpdate[] = [];
    const rem: number[] = [];
    const visible = new Set<number>();
    for (const e of around(p.x, p.y, AOI_RADIUS)) {
      visible.add(e.id);
      const { tuple, json } = tupleOf(e);
      const prev = it.known.get(e.id);
      if (prev === undefined) {
        add.push(entityInit(e));
        upd.push(tuple);
        it.known.set(e.id, json);
      } else if (prev !== json) {
        upd.push(tuple);
        it.known.set(e.id, json);
      }
    }
    for (const id of it.known.keys()) {
      if (!visible.has(id)) {
        rem.push(id);
        it.known.delete(id);
      }
    }
    const ev: GameEvent[] = [];
    for (const q of events) {
      if (q.only !== undefined) {
        if (q.only === it.playerId) ev.push(q.ev);
      } else if (q.anchors.some((a) => a === it.playerId || it.known.has(a))) {
        ev.push(q.ev);
      }
    }
    const msg: ServerMsg = { t: 'snap', tick, me: selfState(p) };
    if (add.length) msg.add = add;
    if (upd.length) msg.upd = upd;
    if (rem.length) msg.rem = rem;
    if (ev.length) msg.ev = ev;
    it.observer.send(msg);
  }
}
