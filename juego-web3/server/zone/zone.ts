import type { Appearance } from '../../shared/appearance.ts';
import { maxHpFor, maxResourceFor, mitigate, rollMelee } from '../../shared/combat.ts';
import { DT, RESPAWN_SECONDS } from '../../shared/constants.ts';
import { AURAS } from '../../shared/data/abilities.ts';
import { ITEMS } from '../../shared/data/items.ts';
import { MOBS } from '../../shared/data/mobs.ts';
import { RACES } from '../../shared/data/races.ts';
import type {
  AbilityDef,
  AuraDef,
  ClassDef,
  FactionId,
  MobDef,
  School,
} from '../../shared/data/types.ts';
import { dirFromWorldDelta } from '../../shared/iso.ts';
import { isWalkable, type MapData } from '../../shared/map.ts';
import { findPath, nearestWalkable } from '../../shared/pathfinding.ts';
import type { ClientMsg, ErrorCode, GameEvent, InventoryItem } from '../../shared/protocol.ts';
import { Rng } from '../../shared/rng.ts';
import type { CharacterProgress } from '../db/store.ts';
import { applyEffects, updateCast } from './abilities.ts';
import { updateMob } from './ai.ts';
import { applyDamage, armorOf, tickAuras } from './combat.ts';
import {
  auraMult,
  baseFields,
  distTo,
  type Entity,
  isRooted,
  isUnit,
  type LootEntity,
  type MobEntity,
  type PlayerEntity,
  type ProjectileEntity,
  type Unit,
} from './entities.ts';
import { SpatialGrid } from './grid.ts';
import { Interest, type Observer, type QueuedEvent, sendSnapshots } from './interest.ts';
import { handleCommand, INVENTORY_SLOTS, STACK_SIZE, updatePlayer } from './player.ts';

/** Segundos que un cadaver de enemigo permanece antes de desaparecer. */
const CORPSE_TIME = 8;
/** Segundos que dura un botin en el suelo. */
const LOOT_TTL = 90;
/** Segundos hasta reaparecer en el cementerio. */
export const PLAYER_RESPAWN = RESPAWN_SECONDS;

export interface PlayerInit {
  charId: number;
  name: string;
  cls: ClassDef;
  faction: FactionId;
  appearance: Appearance;
  level: number;
  x: number | null;
  y: number | null;
  gold: number;
  inventory: InventoryItem[];
}

interface SpawnSlot {
  def: MobDef;
  x: number;
  y: number;
  mobId: number | null;
  timer: number;
}

/**
 * Una zona = un proceso de simulacion autoritativa a 20 Hz. Recibe
 * intenciones en cola, avanza el mundo en pasos fijos y reparte instantaneas
 * por area de interes. No sabe nada de WebSockets (ver server/net).
 */
export class Zone {
  readonly rng: Rng;
  readonly grid: SpatialGrid;
  readonly entities = new Map<number, Entity>();
  tick = 0;
  private nextId = 1;
  private readonly interests = new Map<number, Interest>();
  private inputs: { pid: number; msg: ClientMsg }[] = [];
  private events: QueuedEvent[] = [];
  private readonly slots: SpawnSlot[] = [];

  constructor(
    readonly id: string,
    readonly map: MapData,
    seed = 1,
  ) {
    this.rng = new Rng(seed);
    this.grid = new SpatialGrid(map.width);
    for (const s of map.spawns) {
      const def = MOBS[s.mob];
      if (!def) throw new Error(`Enemigo desconocido en el mapa: ${s.mob}`);
      for (let i = 0; i < s.count; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(0, s.radius);
        const p = nearestWalkable(map, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r, 3) ?? {
          x: s.x,
          y: s.y,
        };
        const slot: SpawnSlot = { def, x: p.x, y: p.y, mobId: null, timer: 0 };
        this.slots.push(slot);
        this.spawnMob(slot);
      }
    }
  }

  // ------------------------------------------------------------ jugadores
  isNameOnline(name: string): boolean {
    const n = name.toLocaleLowerCase('es');
    for (const e of this.entities.values()) {
      if (e.kind === 'player' && e.name.toLocaleLowerCase('es') === n) return true;
    }
    return false;
  }

  isCharacterInZone(charId: number): boolean {
    for (const e of this.entities.values())
      if (e.kind === 'player' && e.charId === charId) return true;
    return false;
  }

  /**
   * Mete en el mundo un personaje cargado de la base de datos. Atributos =
   * base de la clase + pasiva racial. Si no tiene posicion guardada (o ya no
   * es transitable), aparece en el punto de inicio.
   */
  addPlayer(init: PlayerInit, observer: Observer): PlayerEntity {
    const id = this.nextId++;
    const cls = init.cls;
    let pos: { x: number; y: number } | null =
      init.x !== null && init.y !== null && isWalkable(this.map, init.x, init.y)
        ? { x: init.x, y: init.y }
        : null;
    if (!pos) {
      const sp = this.map.playerSpawn;
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(0, sp.radius);
      pos = nearestWalkable(this.map, sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r, 3) ?? sp;
    }
    const { x, y } = pos;
    const stats = { ...cls.base };
    const bonus = RACES[init.appearance.race].passive.stats;
    for (const k of Object.keys(bonus) as (keyof typeof stats)[]) stats[k] += bonus[k] ?? 0;
    const mhp = maxHpFor(cls, stats);
    const mres = maxResourceFor(cls, stats);
    const p: PlayerEntity = {
      ...baseFields(id, 'player', init.name, x, y),
      kind: 'player',
      charId: init.charId,
      appearance: init.appearance,
      level: init.level,
      cls,
      faction: init.faction,
      stats,
      hp: mhp,
      mhp,
      res: cls.resource === 'mana' ? mres : 0,
      mres,
      gold: init.gold,
      inv: init.inventory.map((i) => ({ ...i })),
      invDirty: true,
      cds: new Map(),
      gcd: 0,
      attackId: null,
      pending: null,
      pendingLoot: null,
      repathTimer: 0,
      sinceManaSpent: 99,
      regenAcc: 0,
      respawnTimer: 0,
    };
    this.entities.set(id, p);
    this.grid.update(p);
    this.interests.set(id, new Interest(id, observer));
    return p;
  }

  /** Estado a guardar de un jugador (los muertos se guardan en el cementerio). */
  progressOf(p: PlayerEntity): CharacterProgress {
    const pos = p.dead ? this.map.graveyard : p;
    return {
      id: p.charId,
      zone: this.id,
      x: Math.round(pos.x * 100) / 100,
      y: Math.round(pos.y * 100) / 100,
      level: p.level,
      xp: 0,
      gold: p.gold,
      inventory: p.inv.map((i) => ({ ...i })),
    };
  }

  *players(): Generator<PlayerEntity> {
    for (const e of this.entities.values()) if (e.kind === 'player') yield e;
  }

  removePlayer(id: number): void {
    const p = this.entities.get(id);
    if (!p) return;
    this.grid.remove(p);
    this.entities.delete(id);
    this.interests.delete(id);
    for (const e of this.entities.values()) if (e.kind === 'mob') e.threat.delete(id);
  }

  /** Encola una intencion; se procesa al principio del siguiente tick. */
  queue(pid: number, msg: ClientMsg): void {
    this.inputs.push({ pid, msg });
  }

  // ------------------------------------------------------------ bucle
  step(): void {
    const inputs = this.inputs;
    this.inputs = [];
    for (const { pid, msg } of inputs) {
      const p = this.entities.get(pid);
      if (p && p.kind === 'player') handleCommand(this, p, msg);
    }

    for (const e of [...this.entities.values()]) {
      if (!this.entities.has(e.id)) continue;
      switch (e.kind) {
        case 'player':
          if (!e.dead) tickAuras(this, e, DT);
          updatePlayer(this, e, DT);
          if (!e.dead) {
            updateCast(this, e);
            this.move(e, e.cls.speed);
          }
          break;
        case 'mob':
          if (e.dead) {
            e.corpseTimer -= DT;
            if (e.corpseTimer <= 0) this.despawn(e);
            break;
          }
          tickAuras(this, e, DT);
          if (e.dead) break;
          updateMob(this, e, DT);
          updateCast(this, e);
          this.move(
            e,
            e.state === 'idle'
              ? e.def.speed * 0.4
              : e.state === 'evade'
                ? e.def.speed * 1.5
                : e.def.speed,
          );
          break;
        case 'proj':
          this.updateProjectile(e);
          break;
        case 'loot':
          e.ttl -= DT;
          if (e.ttl <= 0) this.despawn(e);
          break;
      }
    }

    for (const s of this.slots) {
      if (s.mobId !== null) continue;
      s.timer -= DT;
      if (s.timer <= 0) this.spawnMob(s);
    }

    sendSnapshots(
      this.tick,
      this.interests.values(),
      this.entities,
      (x, y, r) => this.grid.around(x, y, r),
      this.events,
    );
    this.events = [];
    this.tick++;
  }

  // ------------------------------------------------------------ utilidades usadas por los sistemas
  emit(ev: GameEvent, anchors: number[]): void {
    this.events.push({ ev, anchors });
  }

  error(pid: number, code: ErrorCode): void {
    this.events.push({ ev: { e: 'err', code }, anchors: [], only: pid });
  }

  unit(id: number | null | undefined): Unit | null {
    if (!id) return null;
    const e = this.entities.get(id);
    return isUnit(e) ? e : null;
  }

  auraDef(id: string): AuraDef | undefined {
    return AURAS[id];
  }

  face(e: Entity, x: number, y: number): void {
    e.dir = dirFromWorldDelta(x - e.x, y - e.y, e.dir);
  }

  pathTo(e: Entity, x: number, y: number): void {
    e.path = findPath(this.map, e.x, e.y, x, y) ?? [];
  }

  teleport(e: Entity, x: number, y: number): void {
    e.x = x;
    e.y = y;
    e.dash = null;
    this.grid.update(e);
  }

  /** Avanza por la ruta (o el desplazamiento forzado) respetando raices y ralentizaciones. */
  private move(e: Unit, baseSpeed: number): void {
    if (e.dash) {
      const d = e.dash;
      const dist = distTo(e, d);
      const step = d.speed * DT;
      this.face(e, d.x, d.y);
      if (dist <= step) {
        e.x = d.x;
        e.y = d.y;
        e.dash = null;
      } else {
        e.x += ((d.x - e.x) / dist) * step;
        e.y += ((d.y - e.y) / dist) * step;
      }
      this.grid.update(e);
      return;
    }
    if (e.path.length === 0 || isRooted(e) || e.cast) return;
    let budget = baseSpeed * auraMult(e, 'speedMult') * DT;
    while (budget > 0 && e.path.length > 0) {
      const wp = e.path[0] as { x: number; y: number };
      const dist = distTo(e, wp);
      this.face(e, wp.x, wp.y);
      if (dist <= budget) {
        e.x = wp.x;
        e.y = wp.y;
        budget -= dist;
        e.path.shift();
      } else {
        e.x += ((wp.x - e.x) / dist) * budget;
        e.y += ((wp.y - e.y) / dist) * budget;
        budget = 0;
      }
    }
    this.grid.update(e);
  }

  // ------------------------------------------------------------ vida y muerte
  kill(u: Unit, killer: Unit | null): void {
    u.dead = true;
    u.path = [];
    u.dash = null;
    u.cast = null;
    u.auras = [];
    this.emit({ e: 'die', id: u.id }, [u.id]);
    if (u.kind === 'mob') {
      u.corpseTimer = CORPSE_TIME;
      const slot = this.slots[u.spawnIndex];
      if (slot) {
        slot.mobId = null;
        slot.timer = u.def.respawn;
      }
      const owner = this.unit(u.tagger ?? killer?.id ?? 0);
      if (owner && owner.kind === 'player') this.dropLoot(u, owner);
    } else {
      u.respawnTimer = PLAYER_RESPAWN;
      u.attackId = null;
      u.pending = null;
      u.pendingLoot = null;
      for (const e of this.entities.values()) if (e.kind === 'mob') e.threat.delete(u.id);
    }
  }

  respawnPlayer(p: PlayerEntity): void {
    p.dead = false;
    p.hp = p.mhp;
    p.res = p.cls.resource === 'mana' ? p.mres : 0;
    p.combatTimer = 0;
    p.targetId = 0;
    this.teleport(p, this.map.graveyard.x, this.map.graveyard.y);
  }

  private spawnMob(slot: SpawnSlot): void {
    const id = this.nextId++;
    const def = slot.def;
    const m: MobEntity = {
      ...baseFields(id, 'mob', def.name, slot.x, slot.y),
      kind: 'mob',
      def,
      level: def.level,
      hp: def.hp,
      mhp: def.hp,
      dir: this.rng.int(0, 7),
      homeX: slot.x,
      homeY: slot.y,
      spawnIndex: this.slots.indexOf(slot),
      state: 'idle',
      threat: new Map(),
      tagger: null,
      wanderTimer: this.rng.range(1, 6),
      scanTimer: 0,
      repathTimer: 0,
      spellCds: new Map(),
      retreatTimer: 0,
      corpseTimer: 0,
    };
    slot.mobId = id;
    this.entities.set(id, m);
    this.grid.update(m);
  }

  private despawn(e: Entity): void {
    this.grid.remove(e);
    this.entities.delete(e.id);
  }

  // ------------------------------------------------------------ proyectiles
  spawnProjectile(
    src: Unit,
    victim: Unit,
    speed: number,
    ability: AbilityDef | null,
    basic: { min: number; max: number } | null,
  ): void {
    const id = this.nextId++;
    let school: School = 'fisico';
    const dmgEff = ability?.effects.find((e) => e.kind === 'damage');
    if (dmgEff && dmgEff.kind === 'damage') school = dmgEff.school;
    const p: ProjectileEntity = {
      ...baseFields(id, 'proj', ability?.name ?? 'Flecha', src.x, src.y),
      kind: 'proj',
      srcId: src.id,
      victimId: victim.id,
      speed,
      ability,
      school,
      basic,
    };
    this.entities.set(id, p);
    this.grid.update(p);
  }

  private updateProjectile(p: ProjectileEntity): void {
    const v = this.unit(p.victimId);
    const src = this.unit(p.srcId);
    if (!v || v.dead || !src) {
      this.despawn(p);
      return;
    }
    const d = distTo(p, v);
    const step = p.speed * DT;
    if (d <= step + 0.3) {
      this.despawn(p);
      if (p.ability) {
        applyEffects(this, src, p.ability, v, null);
      } else if (p.basic) {
        const r = rollMelee(this.rng, src.level, v.level, 0.05, false);
        let dmg = this.rng.int(p.basic.min, p.basic.max);
        if (r === 'crit') dmg *= 2;
        dmg = mitigate(dmg, 'fisico', armorOf(v), src.level);
        applyDamage(this, src, v, dmg, 'fisico', r);
      }
      return;
    }
    this.face(p, v.x, v.y);
    p.x += ((v.x - p.x) / d) * step;
    p.y += ((v.y - p.y) / d) * step;
    this.grid.update(p);
  }

  // ------------------------------------------------------------ botin
  private dropLoot(m: MobEntity, owner: PlayerEntity): void {
    const t = m.def.loot;
    const copper = this.rng.int(t.copper[0], t.copper[1]);
    const items: InventoryItem[] = [];
    for (const it of t.items) {
      if (ITEMS[it.item] && this.rng.chance(it.chance)) items.push({ item: it.item, qty: 1 });
    }
    if (copper <= 0 && items.length === 0) return;
    const id = this.nextId++;
    const l: LootEntity = {
      ...baseFields(id, 'loot', 'Botín', m.x, m.y),
      kind: 'loot',
      ownerId: owner.id,
      copper,
      items,
      ttl: LOOT_TTL,
    };
    this.entities.set(id, l);
    this.grid.update(l);
  }

  /** Mueve el contenido del botin al jugador. Nunca crea oro: solo lo traslada. */
  pickup(p: PlayerEntity, l: LootEntity): void {
    if (l.ownerId !== p.id) {
      this.error(p.id, 'botin_ajeno');
      return;
    }
    if (distTo(p, l) > 2.5) {
      this.error(p.id, 'fuera_alcance');
      return;
    }
    const taken: string[] = [];
    const left: InventoryItem[] = [];
    for (const it of l.items) {
      if (addToInventory(p.inv, it.item, it.qty)) taken.push(it.item);
      else left.push(it);
    }
    const copper = l.copper;
    p.gold += copper;
    l.copper = 0;
    l.items = left;
    if (taken.length) p.invDirty = true;
    this.events.push({ ev: { e: 'loot', c: copper, items: taken }, anchors: [], only: p.id });
    if (left.length) this.error(p.id, 'inventario_lleno');
    else this.despawn(l);
  }
}

/** Anade objetos apilando hasta STACK_SIZE. Devuelve false si no caben. */
export function addToInventory(inv: InventoryItem[], item: string, qty: number): boolean {
  // Primero se comprueba la capacidad: o cabe todo o no se toca nada.
  let room = (INVENTORY_SLOTS - inv.length) * STACK_SIZE;
  for (const slot of inv) if (slot.item === item) room += STACK_SIZE - slot.qty;
  if (room < qty) return false;
  let rest = qty;
  for (const slot of inv) {
    if (slot.item === item && slot.qty < STACK_SIZE) {
      const n = Math.min(rest, STACK_SIZE - slot.qty);
      slot.qty += n;
      rest -= n;
      if (rest === 0) return true;
    }
  }
  while (rest > 0 && inv.length < INVENTORY_SLOTS) {
    const n = Math.min(rest, STACK_SIZE);
    inv.push({ item, qty: n });
    rest -= n;
  }
  return rest === 0;
}
