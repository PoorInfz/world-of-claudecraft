import { ABILITIES } from '../../shared/data/abilities.ts';
import { hasLineOfSight, nearestWalkable } from '../../shared/pathfinding.ts';
import { beginCast, checkCast } from './abilities.ts';
import { meleeSwing } from './combat.ts';
import { distTo, isRooted, isStunned, type MobEntity, type Unit } from './entities.ts';
import type { Zone } from './zone.ts';

/**
 * IA de enemigos. Maquina de estados simple: reposo (deambula y busca
 * victimas), combate (persigue al de mas amenaza y ataca segun su arquetipo)
 * y evasion (vuelve a casa inmune y se cura).
 */

/** Distancia a casa a partir de la cual el enemigo abandona la persecucion. */
export const LEASH_RANGE = 22;

export function updateMob(z: Zone, m: MobEntity, dt: number): void {
  for (const [k, v] of m.spellCds) m.spellCds.set(k, Math.max(0, v - dt));
  m.swingTimer = Math.max(0, m.swingTimer - dt);
  m.repathTimer -= dt;
  m.retreatTimer -= dt;
  if (isStunned(m)) return;
  if (m.cast) return; // updateCast lo gestiona la zona

  switch (m.state) {
    case 'idle':
      idle(z, m, dt);
      break;
    case 'combat':
      combat(z, m);
      break;
    case 'evade':
      evade(z, m);
      break;
  }
}

function idle(z: Zone, m: MobEntity, dt: number): void {
  // Regeneracion completa fuera de combate.
  if (m.hp < m.mhp) m.hp = Math.min(m.mhp, m.hp + m.mhp * 0.1 * dt);

  m.scanTimer -= dt;
  if (m.scanTimer <= 0) {
    m.scanTimer = 0.25;
    for (const e of z.grid.within(m.x, m.y, m.def.aggroRadius)) {
      if (e.kind === 'player' && !e.dead && hasLineOfSight(z.map, m.x, m.y, e.x, e.y)) {
        m.threat.set(e.id, 1);
        m.state = 'combat';
        m.path = [];
        return;
      }
    }
  }

  m.wanderTimer -= dt;
  if (m.wanderTimer <= 0 && m.path.length === 0) {
    m.wanderTimer = z.rng.range(4, 9);
    const tx = m.homeX + z.rng.range(-3, 3);
    const ty = m.homeY + z.rng.range(-3, 3);
    const p = nearestWalkable(z.map, tx, ty, 2);
    if (p) z.pathTo(m, p.x, p.y);
  }
}

/** Objetivo con mas amenaza; solo cambia si alguien supera al actual en un 10%. */
function pickTarget(z: Zone, m: MobEntity): Unit | null {
  let current = z.unit(m.targetId);
  if (current && (current.dead || !m.threat.has(current.id))) current = null;
  let best: Unit | null = current;
  let bestThreat = current ? (m.threat.get(current.id) ?? 0) * 1.1 : -1;
  for (const [id, threat] of m.threat) {
    const u = z.unit(id);
    if (!u || u.dead) {
      m.threat.delete(id);
      continue;
    }
    if (threat > bestThreat) {
      best = u;
      bestThreat = threat;
    }
  }
  return best;
}

function combat(z: Zone, m: MobEntity): void {
  const t = pickTarget(z, m);
  if (!t || distTo(m, { x: m.homeX, y: m.homeY }) > LEASH_RANGE) {
    startEvade(z, m);
    return;
  }
  m.targetId = t.id;
  const d = distTo(m, t);
  const los = hasLineOfSight(z.map, m.x, m.y, t.x, t.y);

  // Lanzadores: sanar a un aliado herido o lanzar su hechizo de dano.
  if (m.def.ai === 'caster' && m.def.spells) {
    for (const spellId of m.def.spells) {
      const ab = ABILITIES[spellId];
      if (!ab) continue;
      if (ab.target === 'ally') {
        const ally = woundedAlly(z, m, ab.range);
        if (ally && !checkCast(z, m, ab, ally.id)) {
          beginCast(z, m, ab, ally.id, null);
          return;
        }
      } else if (d > 1.5 && !checkCast(z, m, ab, t.id)) {
        beginCast(z, m, ab, t.id, null);
        return;
      }
    }
  }

  if (m.def.ai === 'ranged') {
    // Retrocede si el objetivo se le echa encima (como mucho cada 4 s).
    const keep = m.def.keepDistance ?? 0;
    if (d < keep * 0.5 && m.retreatTimer <= 0 && !isRooted(m)) {
      m.retreatTimer = 4;
      const ax = m.x + ((m.x - t.x) / Math.max(d, 0.01)) * keep;
      const ay = m.y + ((m.y - t.y) / Math.max(d, 0.01)) * keep;
      const p = nearestWalkable(z.map, ax, ay, 2);
      if (p) {
        z.pathTo(m, p.x, p.y);
        return;
      }
    }
    if (m.path.length > 0 && m.retreatTimer > 2) return;
    if (d <= m.def.range && los && d > 1.6) {
      m.path = [];
      z.face(m, t.x, t.y);
      if (m.swingTimer <= 0) {
        m.swingTimer = m.def.damage.speed;
        z.emit({ e: 'swing', s: m.id, t: t.id }, [m.id, t.id]);
        z.spawnProjectile(m, t, 16, null, { min: m.def.damage.min, max: m.def.damage.max });
      }
      return;
    }
  }

  // Cuerpo a cuerpo (los arqueros y lanzadores tambien pegan si los alcanzan).
  const meleeRange = m.def.ai === 'melee' ? m.def.range : 1.4;
  if (d <= meleeRange) {
    m.path = [];
    z.face(m, t.x, t.y);
    if (m.swingTimer <= 0) {
      m.swingTimer = m.def.damage.speed;
      meleeSwing(z, m, t);
    }
    return;
  }
  // Persigue.
  if (m.repathTimer <= 0 || m.path.length === 0) {
    m.repathTimer = 0.4;
    z.pathTo(m, t.x, t.y);
  }
}

function woundedAlly(z: Zone, m: MobEntity, range: number): MobEntity | null {
  let best: MobEntity | null = null;
  for (const e of z.grid.within(m.x, m.y, range)) {
    if (e.kind !== 'mob' || e.dead || e.state === 'evade') continue;
    if (e.hp / e.mhp >= 0.5) continue;
    if (!best || e.hp / e.mhp < best.hp / best.mhp) best = e;
  }
  return best;
}

export function startEvade(z: Zone, m: MobEntity): void {
  m.state = 'evade';
  m.threat.clear();
  m.targetId = 0;
  m.cast = null;
  m.auras = m.auras.filter((a) => !a.def.harmful);
  z.pathTo(m, m.homeX, m.homeY);
}

function evade(z: Zone, m: MobEntity): void {
  if (m.path.length === 0 || distTo(m, { x: m.homeX, y: m.homeY }) < 0.5) {
    if (distTo(m, { x: m.homeX, y: m.homeY }) > 1.5) {
      // Atascado: vuelve a casa directamente.
      z.teleport(m, m.homeX, m.homeY);
    }
    m.state = 'idle';
    m.hp = m.mhp;
    m.tagger = null;
    m.wanderTimer = 2;
  }
}
