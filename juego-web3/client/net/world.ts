import { INTERP_DELAY_MS, TICK_RATE } from '../../shared/constants.ts';
import { CLASSES } from '../../shared/data/classes.ts';
import type { ClassId, FactionId } from '../../shared/data/types.ts';
import { dirFromWorldDelta } from '../../shared/iso.ts';
import type { MapData } from '../../shared/map.ts';
import { findPath } from '../../shared/pathfinding.ts';
import {
  type EntityInit,
  FLAG,
  type GameEvent,
  type InventoryItem,
  type SelfState,
  type ServerMsg,
} from '../../shared/protocol.ts';

/**
 * Espejo del mundo en el cliente. Solo refleja lo que manda el servidor:
 * nunca decide combate, botin ni posiciones definitivas.
 *
 * - Entidades remotas: buffer de muestras y render INTERP_DELAY_MS en el
 *   pasado, interpolando entre las dos muestras que rodean ese instante.
 * - Jugador propio: prediccion del movimiento (misma ruta A* que el
 *   servidor) y correccion suave al recibir la posicion autoritativa.
 */

const TICK_MS = 1000 / TICK_RATE;

interface Sample {
  t: number;
  x: number;
  y: number;
}

export interface ClientEntity {
  init: EntityInit;
  id: number;
  x: number;
  y: number;
  hp: number;
  mhp: number;
  dir: number;
  flags: number;
  targetId: number;
  auras: string[];
  samples: Sample[];
  /** Para el propio jugador: tiempo de la ultima posicion autoritativa. */
  lastServerX: number;
  lastServerY: number;
}

export class ClientWorld {
  readonly entities = new Map<number, ClientEntity>();
  selfId = 0;
  self: SelfState | null = null;
  inventory: InventoryItem[] = [];
  serverTick = 0;
  /** Desfase reloj local - reloj del servidor (ms), minimo observado suavizado. */
  private clockOffset: number | null = null;
  private eventHandlers: ((e: GameEvent) => void)[] = [];
  private removeHandlers: ((id: number) => void)[] = [];

  // Prediccion del propio jugador.
  predicting = false;
  private predPath: { x: number; y: number }[] = [];
  private history: { t: number; x: number; y: number }[] = [];
  px = 0;
  py = 0;
  pdir = 0;

  constructor(
    readonly map: MapData,
    readonly cls: ClassId,
    readonly faction: FactionId,
  ) {}

  onEvent(h: (e: GameEvent) => void): void {
    this.eventHandlers.push(h);
  }

  onRemove(h: (id: number) => void): void {
    this.removeHandlers.push(h);
  }

  /** Hora del servidor (ms) estimada para el instante local 'now'. */
  serverTimeAt(now: number): number {
    return now - (this.clockOffset ?? now);
  }

  apply(msg: ServerMsg, now: number, rtt: number): void {
    if (msg.t === 'welcome') {
      this.selfId = msg.id;
      this.px = msg.x;
      this.py = msg.y;
      return;
    }
    if (msg.t !== 'snap') return;
    this.serverTick = msg.tick;
    const st = msg.tick * TICK_MS;
    const off = now - st;
    // El minimo desfase corresponde al paquete que llego mas rapido.
    if (this.clockOffset === null || off < this.clockOffset) this.clockOffset = off;
    else this.clockOffset += (off - this.clockOffset) * 0.002;

    for (const a of msg.add ?? []) {
      this.entities.set(a.id, {
        init: a,
        id: a.id,
        x: a.x,
        y: a.y,
        hp: a.mhp,
        mhp: a.mhp,
        dir: 0,
        flags: 0,
        targetId: 0,
        auras: [],
        samples: [{ t: st, x: a.x, y: a.y }],
        lastServerX: a.x,
        lastServerY: a.y,
      });
    }
    for (const u of msg.upd ?? []) {
      const e = this.entities.get(u[0]);
      if (!e) continue;
      const [, x, y, hp, mhp, dir, flags, targetId, auras] = u;
      e.hp = hp;
      e.mhp = mhp;
      e.dir = dir;
      e.flags = flags;
      e.targetId = targetId;
      e.auras = auras;
      e.lastServerX = x;
      e.lastServerY = y;
      const last = e.samples[e.samples.length - 1];
      if (last && Math.hypot(last.x - x, last.y - y) > 4) {
        // Teletransporte: sin interpolacion.
        e.samples = [{ t: st, x, y }];
        e.x = x;
        e.y = y;
        if (u[0] === this.selfId) this.resetPrediction(x, y);
      } else {
        // Si estaba quieta, asumimos que empezo a moverse un tick antes.
        if (last && st - last.t > TICK_MS * 1.5)
          e.samples.push({ t: st - TICK_MS, x: last.x, y: last.y });
        e.samples.push({ t: st, x, y });
        if (e.samples.length > 30) e.samples.splice(0, e.samples.length - 30);
      }
      if (u[0] === this.selfId) this.reconcile(x, y, now, rtt, flags);
    }
    for (const id of msg.rem ?? []) {
      this.entities.delete(id);
      for (const h of this.removeHandlers) h(id);
    }
    if (msg.me) {
      this.self = msg.me;
      if (msg.me.inv) this.inventory = msg.me.inv;
    }
    for (const ev of msg.ev ?? []) for (const h of this.eventHandlers) h(ev);
  }

  // ---------------------------------------------------------- prediccion
  /** Empieza a predecir un movimiento hacia (x, y). */
  predictMove(x: number, y: number): void {
    const me = this.entities.get(this.selfId);
    if (!me) return;
    if (me.flags & (FLAG.rooted | FLAG.stunned | FLAG.dead)) return;
    const path = findPath(this.map, this.px, this.py, x, y);
    if (!path) return;
    this.predPath = path;
    this.predicting = true;
  }

  /** El servidor maneja al jugador (perseguir, lanzar, recoger): dejar de predecir. */
  stopPredicting(): void {
    this.predicting = false;
    this.predPath = [];
  }

  private resetPrediction(x: number, y: number): void {
    this.px = x;
    this.py = y;
    this.predPath = [];
    this.history = [];
    this.predicting = false;
  }

  private reconcile(sx: number, sy: number, now: number, rtt: number, flags: number): void {
    if (!this.predicting) return;
    if (flags & (FLAG.rooted | FLAG.stunned | FLAG.dead)) {
      this.resetPrediction(sx, sy);
      return;
    }
    // La posicion del servidor corresponde a nuestra prediccion de hace ~RTT.
    const t = now - rtt - TICK_MS;
    let ref = this.history[0];
    for (const h of this.history) {
      if (h.t <= t) ref = h;
      else break;
    }
    if (!ref) return;
    const ex = sx - ref.x;
    const ey = sy - ref.y;
    const err = Math.hypot(ex, ey);
    if (err > 1.5) {
      this.px += ex;
      this.py += ey;
      const goal = this.predPath[this.predPath.length - 1];
      if (goal) this.predictMove(goal.x, goal.y);
    } else if (err > 0.2) {
      this.px += ex * 0.1;
      this.py += ey * 0.1;
    }
  }

  /** Avanza la simulacion local del propio jugador y las interpolaciones. */
  update(now: number, dtSec: number): void {
    const renderT = this.serverTimeAt(now) - INTERP_DELAY_MS;
    for (const e of this.entities.values()) {
      if (e.id === this.selfId) continue;
      interpolate(e, renderT);
    }
    const me = this.entities.get(this.selfId);
    if (!me) return;
    if (this.predicting) {
      let speed = CLASSES[this.cls].speed * dtSec;
      if (me.flags & FLAG.slowed) speed *= 0.6;
      for (let wp = this.predPath[0]; speed > 0 && wp; wp = this.predPath[0]) {
        const d = Math.hypot(wp.x - this.px, wp.y - this.py);
        this.pdir = dirFromWorldDelta(wp.x - this.px, wp.y - this.py, this.pdir);
        if (d <= speed) {
          this.px = wp.x;
          this.py = wp.y;
          speed -= d;
          this.predPath.shift();
        } else {
          this.px += ((wp.x - this.px) / d) * speed;
          this.py += ((wp.y - this.py) / d) * speed;
          speed = 0;
        }
      }
      this.history.push({ t: now, x: this.px, y: this.py });
      while ((this.history[0]?.t ?? now) < now - 2000) this.history.shift();
      // Al terminar la ruta y quedar quieto en el servidor, volver a seguirle.
      if (this.predPath.length === 0 && !(me.flags & FLAG.moving)) {
        const err = Math.hypot(me.lastServerX - this.px, me.lastServerY - this.py);
        if (err < 0.3) this.predicting = false;
      }
      me.x = this.px;
      me.y = this.py;
      me.dir = this.pdir;
    } else {
      // Seguir la posicion autoritativa con un suavizado muy corto.
      const k = Math.min(1, dtSec * 18);
      this.px += (me.lastServerX - this.px) * k;
      this.py += (me.lastServerY - this.py) * k;
      if (Math.hypot(me.lastServerX - this.px, me.lastServerY - this.py) > 3) {
        this.px = me.lastServerX;
        this.py = me.lastServerY;
      }
      me.x = this.px;
      me.y = this.py;
      this.pdir = me.dir;
    }
  }

  get me(): ClientEntity | undefined {
    return this.entities.get(this.selfId);
  }
}

function interpolate(e: ClientEntity, t: number): void {
  const s = e.samples;
  if (s.length === 0) return;
  // Descarta muestras viejas, conservando una anterior a t.
  while (s.length > 2 && (s[1] as Sample).t <= t) s.shift();
  const a = s[0] as Sample;
  const b = s[1];
  if (!b || t <= a.t) {
    e.x = a.x;
    e.y = a.y;
    return;
  }
  if (t >= b.t) {
    e.x = b.x;
    e.y = b.y;
    return;
  }
  const k = (t - a.t) / (b.t - a.t);
  e.x = a.x + (b.x - a.x) * k;
  e.y = a.y + (b.y - a.y) * k;
}
