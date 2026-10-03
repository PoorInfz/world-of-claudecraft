import {
  critMultiplier,
  meleeCritChance,
  mitigate,
  rollMelee,
  rollSpell,
  weaponHit,
} from '../../shared/combat.ts';
import { DT } from '../../shared/constants.ts';
import type { AbilityDef, EffectDef } from '../../shared/data/types.ts';
import type { Vec2 } from '../../shared/iso.ts';
import { isWalkable } from '../../shared/map.ts';
import { hasLineOfSight } from '../../shared/pathfinding.ts';
import type { ErrorCode } from '../../shared/protocol.ts';
import { applyAura, applyDamage, applyHeal, armorOf, attackPowerOf, hostile } from './combat.ts';
import { distTo, isStunned, type Unit } from './entities.ts';
import type { Zone } from './zone.ts';

/** Tiempo de reutilizacion global. */
export const GCD = 1.5;
/** Holgura de alcance para compensar latencia (baldosas). */
const RANGE_SLACK = 0.5;

/**
 * Comprueba si 'caster' puede usar 'ab' ahora mismo. Devuelve un codigo de
 * error o null. Es la misma comprobacion al empezar y al terminar un
 * lanzamiento, asi que nada caduca entre medias sin que el servidor lo vea.
 */
export function checkCast(
  z: Zone,
  caster: Unit,
  ab: AbilityDef,
  targetId: number | null,
): ErrorCode | null {
  if (caster.dead || isStunned(caster)) return 'no_puedes_ahora';
  if (caster.kind === 'player') {
    if (!caster.cls.abilities.includes(ab.id)) return 'objetivo_invalido';
    if ((caster.cds.get(ab.id) ?? 0) > 0) return 'en_reutilizacion';
    if (ab.gcd && caster.gcd > 0) return 'en_reutilizacion';
    if (caster.res < ab.cost) return 'sin_recurso';
  } else if ((caster.spellCds.get(ab.id) ?? 0) > 0) {
    return 'en_reutilizacion';
  }
  if (ab.target === 'enemy' || ab.target === 'ally') {
    const t = targetId !== null ? z.unit(targetId) : null;
    if (!t || t.dead) return 'sin_objetivo';
    const wantHostile = ab.target === 'enemy';
    if (hostile(caster, t) !== wantHostile) return 'objetivo_invalido';
    const d = distTo(caster, t);
    if (d > ab.range + RANGE_SLACK) return 'fuera_alcance';
    if (ab.minRange !== undefined && d < ab.minRange) return 'demasiado_cerca';
    if (!hasLineOfSight(z.map, caster.x, caster.y, t.x, t.y)) return 'sin_linea';
  }
  return null;
}

/** Empieza (o resuelve, si es instantanea) una habilidad ya validada. */
export function beginCast(
  z: Zone,
  caster: Unit,
  ab: AbilityDef,
  targetId: number | null,
  point: Vec2 | null,
): void {
  if (caster.kind === 'player' && ab.gcd) caster.gcd = GCD;
  if (targetId !== null) faceTowards(z, caster, targetId);
  if (ab.castTime > 0) {
    caster.path = [];
    caster.cast = { ability: ab, targetId, point, left: ab.castTime, total: ab.castTime };
    z.emit({ e: 'cast', s: caster.id, ab: ab.id, d: ab.castTime }, [caster.id]);
    return;
  }
  commit(z, caster, ab, targetId, point);
}

/** Avanza un lanzamiento en curso; al terminar revalida y resuelve. */
export function updateCast(z: Zone, caster: Unit): void {
  const c = caster.cast;
  if (!c) return;
  c.left -= DT;
  if (c.left > 1e-9) return;
  caster.cast = null;
  // Revalidar sin el GCD (ya se consumio al empezar).
  const savedGcd = caster.kind === 'player' ? caster.gcd : 0;
  if (caster.kind === 'player') caster.gcd = 0;
  const err = checkCast(z, caster, c.ability, c.targetId);
  if (caster.kind === 'player') caster.gcd = savedGcd;
  if (err) {
    if (caster.kind === 'player') z.error(caster.id, err);
    return;
  }
  commit(z, caster, c.ability, c.targetId, c.point);
}

export function cancelCast(caster: Unit): void {
  caster.cast = null;
}

function faceTowards(z: Zone, caster: Unit, targetId: number): void {
  const t = z.unit(targetId);
  if (t) z.face(caster, t.x, t.y);
}

/** Paga el coste, aplica reutilizacion y lanza los efectos. */
function commit(
  z: Zone,
  caster: Unit,
  ab: AbilityDef,
  targetId: number | null,
  point: Vec2 | null,
): void {
  if (caster.kind === 'player') {
    caster.res -= ab.cost;
    if (ab.cost > 0 && caster.cls.resource === 'mana') caster.sinceManaSpent = 0;
    if (ab.cooldown > 0) caster.cds.set(ab.id, ab.cooldown);
  } else if (ab.cooldown > 0) {
    caster.spellCds.set(ab.id, ab.cooldown);
  }
  const target = targetId !== null ? z.unit(targetId) : null;

  if (ab.target === 'self_aoe') {
    z.emit({ e: 'fx', s: caster.id, ab: ab.id, x: caster.x, y: caster.y }, [caster.id]);
    for (const e of z.grid.within(caster.x, caster.y, ab.radius ?? 2)) {
      if ((e.kind === 'player' || e.kind === 'mob') && !e.dead && hostile(caster, e)) {
        applyEffects(z, caster, ab, e, point);
      }
    }
    return;
  }
  if (ab.target === 'self') {
    z.emit({ e: 'fx', s: caster.id, ab: ab.id, x: caster.x, y: caster.y }, [caster.id]);
    applyEffects(z, caster, ab, caster, point);
    return;
  }
  if (ab.target === 'point') {
    applyEffects(z, caster, ab, null, point);
    return;
  }
  if (!target) return;
  if (ab.projectileSpeed) {
    z.spawnProjectile(caster, target, ab.projectileSpeed, ab, null);
    return;
  }
  applyEffects(z, caster, ab, target, point);
}

/** Calcula el dano de un efecto contra un objetivo. */
export function effectDamage(
  z: Zone,
  caster: Unit,
  ab: AbilityDef,
  eff: Extract<EffectDef, { kind: 'damage' }>,
  target: Unit,
): { amount: number; result: ReturnType<typeof rollSpell> } {
  const physical = eff.school === 'fisico';
  let result: ReturnType<typeof rollSpell>;
  if (physical) {
    const crit = caster.kind === 'player' ? meleeCritChance(caster.stats.agi) : 0.05;
    result = rollMelee(z.rng, caster.level, target.level, crit, ab.range <= 2);
  } else {
    result = rollSpell(z.rng, caster.level, target.level);
  }
  let amount = z.rng.int(eff.min, eff.max);
  if (eff.weaponMult) {
    const ap = attackPowerOf(caster);
    if (caster.kind === 'player') {
      const w = caster.cls.weapon;
      amount += weaponHit(z.rng, w.min, w.max, w.speed, ap) * eff.weaponMult;
    } else {
      const d = caster.def.damage;
      amount += z.rng.int(d.min, d.max) * eff.weaponMult;
    }
  }
  if (result === 'crit') amount *= critMultiplier(eff.school);
  amount = mitigate(amount, eff.school, armorOf(target), caster.level);
  return { amount, result };
}

/** Aplica todos los efectos de una habilidad sobre un objetivo (o un punto). */
export function applyEffects(
  z: Zone,
  caster: Unit,
  ab: AbilityDef,
  target: Unit | null,
  point: Vec2 | null,
): void {
  let landed = true;
  for (const eff of ab.effects) {
    switch (eff.kind) {
      case 'damage': {
        if (!target) break;
        const { amount, result } = effectDamage(z, caster, ab, eff, target);
        applyDamage(z, caster, target, amount, eff.school, result, {
          ability: ab.id,
          threat: ab.threat,
        });
        landed = result === 'hit' || result === 'crit';
        break;
      }
      case 'heal':
        if (target) applyHeal(z, caster, target, z.rng.int(eff.min, eff.max));
        break;
      case 'aura': {
        if (!target) break;
        const def = z.auraDef(eff.aura);
        if (!def) break;
        // Los perjuicios solo se aplican si el golpe acerto.
        if (def.harmful && (!landed || target === caster)) break;
        applyAura(z, caster, def.harmful ? target : caster, eff.aura);
        break;
      }
      case 'resource':
        if (caster.kind === 'player') caster.res = Math.min(caster.mres, caster.res + eff.amount);
        break;
      case 'charge':
        if (target) chargeTo(z, caster, target);
        break;
      case 'blink':
        if (point) blinkTowards(z, caster, point, eff.distance);
        break;
    }
  }
}

function chargeTo(z: Zone, caster: Unit, target: Unit): void {
  const d = distTo(caster, target);
  const stop = Math.max(0, d - 1);
  const nx = caster.x + ((target.x - caster.x) / d) * stop;
  const ny = caster.y + ((target.y - caster.y) / d) * stop;
  z.emit({ e: 'fx', s: caster.id, ab: 'carga', x: nx, y: ny }, [caster.id, target.id]);
  caster.path = [];
  caster.dash = { x: nx, y: ny, speed: 22 };
  if (caster.kind === 'player') caster.attackId = target.id;
}

/** Avanza en linea recta hasta 'distance' sin atravesar obstaculos. */
function blinkTowards(z: Zone, caster: Unit, point: Vec2, distance: number): void {
  const dx = point.x - caster.x;
  const dy = point.y - caster.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const max = Math.min(distance, len);
  let bx = caster.x;
  let by = caster.y;
  for (let s = 0.1; s <= max + 1e-9; s += 0.1) {
    const x = caster.x + (dx / len) * s;
    const y = caster.y + (dy / len) * s;
    if (!isWalkable(z.map, x, y)) break;
    bx = x;
    by = y;
  }
  z.emit({ e: 'fx', s: caster.id, ab: 'parpadeo', x: caster.x, y: caster.y }, [caster.id]);
  // Romper raices y ralentizaciones, como el parpadeo clasico.
  caster.auras = caster.auras.filter((a) => !(a.def.root || a.def.speedMult));
  caster.path = [];
  z.teleport(caster, bx, by);
}
