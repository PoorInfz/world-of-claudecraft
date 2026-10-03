import {
  attackPowerFor,
  critMultiplier,
  meleeCritChance,
  mitigate,
  rageFromDealt,
  rageFromTaken,
  rollMelee,
  weaponHit,
} from '../../shared/combat.ts';
import { AURAS } from '../../shared/data/abilities.ts';
import type { School } from '../../shared/data/types.ts';
import type { HitWire } from '../../shared/protocol.ts';
import { auraMult, auraSum, type Unit } from './entities.ts';
import type { Zone } from './zone.ts';

/** Segundos que una unidad sigue "en combate" tras dar o recibir un golpe. */
export const COMBAT_LINGER = 5;

/** En la Fase 1 solo hay JcE: jugadores contra enemigos. El JcJ llega en la Fase 9. */
export function hostile(a: Unit, b: Unit): boolean {
  return a.kind !== b.kind;
}

export function armorOf(u: Unit): number {
  const base = u.kind === 'player' ? u.stats.armor : u.def.armor;
  return base + auraSum(u, 'armor');
}

export function attackPowerOf(u: Unit): number {
  if (u.kind === 'mob') return auraSum(u, 'attackPower');
  return attackPowerFor(u.cls, u.stats, u.level) + auraSum(u, 'attackPower');
}

export function enterCombat(a: Unit, b: Unit): void {
  a.combatTimer = COMBAT_LINGER;
  b.combatTimer = COMBAT_LINGER;
}

export function addThreat(z: Zone, mob: Unit, src: Unit, amount: number): void {
  if (mob.kind !== 'mob' || src.kind !== 'player' || mob.dead || mob.state === 'evade') return;
  mob.threat.set(src.id, (mob.threat.get(src.id) ?? 0) + Math.max(1, amount));
  if (mob.tagger === null) mob.tagger = src.id;
  if (mob.state === 'idle') {
    mob.state = 'combat';
    mob.path = [];
    // Los enemigos sociales llaman a los suyos.
    if (mob.def.social) {
      for (const e of z.grid.within(mob.x, mob.y, 4)) {
        if (
          e.kind === 'mob' &&
          e !== mob &&
          !e.dead &&
          e.def.id === mob.def.id &&
          e.state === 'idle'
        ) {
          addThreat(z, e, src, 1);
        }
      }
    }
  }
}

/**
 * Aplica dano ya calculado. Unico punto por el que baja la vida: gestiona
 * multiplicadores de aura, amenaza, ira, combate y muerte.
 */
export function applyDamage(
  z: Zone,
  src: Unit | null,
  tgt: Unit,
  raw: number,
  school: School,
  result: HitWire,
  opts: { ability?: string; melee?: boolean; threat?: number } = {},
): number {
  if (tgt.dead) return 0;
  if (tgt.kind === 'mob' && tgt.state === 'evade') result = 'miss';
  let amount = 0;
  if (result === 'hit' || result === 'crit') {
    amount = Math.max(1, Math.round(raw * auraMult(tgt, 'damageTakenMult')));
  }
  z.emit(
    { e: 'dmg', s: src?.id ?? 0, t: tgt.id, a: amount, sc: school, r: result, ab: opts.ability },
    [tgt.id, src?.id ?? 0],
  );
  if (src) {
    enterCombat(src, tgt);
    addThreat(z, tgt, src, amount + (opts.threat ?? 0));
    if (src.kind === 'player' && src.cls.resource === 'ira' && opts.melee && amount > 0) {
      src.res = Math.min(src.mres, src.res + rageFromDealt(amount, src.level));
    }
  }
  if (amount <= 0) return 0;
  if (tgt.kind === 'player' && tgt.cls.resource === 'ira') {
    tgt.res = Math.min(tgt.mres, tgt.res + rageFromTaken(amount, tgt.level));
  }
  // Recibir dano no interrumpe el lanzamiento (en los clasicos solo lo retrasa).
  tgt.hp -= amount;
  if (tgt.hp <= 0) {
    tgt.hp = 0;
    z.kill(tgt, src);
  }
  return amount;
}

export function applyHeal(z: Zone, src: Unit, tgt: Unit, amount: number): void {
  if (tgt.dead) return;
  const a = Math.min(Math.round(amount), tgt.mhp - tgt.hp);
  tgt.hp += a;
  z.emit({ e: 'heal', s: src.id, t: tgt.id, a }, [tgt.id, src.id]);
}

/** Golpe basico cuerpo a cuerpo (autoataque). */
export function meleeSwing(z: Zone, a: Unit, t: Unit): void {
  z.emit({ e: 'swing', s: a.id, t: t.id }, [a.id, t.id]);
  if (a.kind === 'player') {
    const w = a.cls.weapon;
    const crit = meleeCritChance(a.stats.agi);
    const r = rollMelee(z.rng, a.level, t.level, crit, true);
    let dmg = weaponHit(z.rng, w.min, w.max, w.speed, attackPowerOf(a));
    if (r === 'crit') dmg *= critMultiplier('fisico');
    dmg = mitigate(dmg, w.school, armorOf(t), a.level);
    applyDamage(z, a, t, dmg, w.school, r, { melee: true });
  } else {
    const d = a.def.damage;
    const r = rollMelee(z.rng, a.level, t.level, 0.05, true);
    let dmg = z.rng.int(d.min, d.max) + (attackPowerOf(a) / 14) * d.speed;
    if (r === 'crit') dmg *= critMultiplier(d.school);
    dmg = mitigate(dmg, d.school, armorOf(t), a.level);
    applyDamage(z, a, t, dmg, d.school, r, { melee: true });
  }
}

export function applyAura(_z: Zone, src: Unit, tgt: Unit, auraId: string): void {
  const def = AURAS[auraId];
  if (!def || tgt.dead) return;
  const existing = tgt.auras.find((a) => a.def.id === auraId);
  if (existing) {
    existing.left = def.duration;
    existing.srcId = src.id;
    return;
  }
  tgt.auras.push({ def, left: def.duration, srcId: src.id, tickAcc: 0 });
  if (def.stun) {
    tgt.cast = null;
    tgt.path = [];
  }
  if (def.root) tgt.path = [];
  if (def.harmful) enterCombat(src, tgt);
}

/** Avanza la duracion de las auras y aplica el dano periodico. */
export function tickAuras(z: Zone, u: Unit, dt: number): void {
  if (u.auras.length === 0) return;
  for (const a of u.auras) {
    a.left -= dt;
    const dot = a.def.dot;
    if (dot) {
      a.tickAcc += dt;
      if (a.tickAcc >= dot.tickEvery - 1e-9) {
        a.tickAcc -= dot.tickEvery;
        const src = z.unit(a.srcId);
        applyDamage(z, src, u, dot.amount, dot.school, 'hit', { ability: a.def.id });
        if (u.dead) return;
      }
    }
  }
  u.auras = u.auras.filter((a) => a.left > 1e-9);
}
