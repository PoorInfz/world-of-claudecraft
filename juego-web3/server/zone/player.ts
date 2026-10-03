import { hpRegenPer2s, manaRegenPer2s } from '../../shared/combat.ts';
import { LOOT_RANGE } from '../../shared/constants.ts';
import { ABILITIES } from '../../shared/data/abilities.ts';
import type { ClientMsg } from '../../shared/protocol.ts';
import { beginCast, cancelCast, checkCast } from './abilities.ts';
import { hostile, meleeSwing } from './combat.ts';
import { distTo, isRooted, isStunned, type PlayerEntity } from './entities.ts';
import type { Zone } from './zone.ts';

/** Huecos de inventario (sin bolsas extra en la Fase 1). */
export const INVENTORY_SLOTS = 16;
export const STACK_SIZE = 20;

/**
 * Traduce una intencion del cliente en estado de servidor. Nada de lo que
 * llega aqui se da por bueno: cada orden se valida contra el estado actual.
 */
export function handleCommand(z: Zone, p: PlayerEntity, msg: ClientMsg): void {
  if (p.dead) return;
  switch (msg.t) {
    case 'move': {
      if (isRooted(p)) {
        z.error(p.id, 'no_puedes_ahora');
        return;
      }
      clearIntent(p);
      cancelCast(p);
      z.pathTo(p, msg.x, msg.y);
      return;
    }
    case 'stop':
      clearIntent(p);
      p.path = [];
      return;
    case 'target': {
      if (msg.id === null) {
        p.targetId = 0;
        return;
      }
      const t = z.entities.get(msg.id);
      if (t && (t.kind === 'player' || t.kind === 'mob')) p.targetId = t.id;
      return;
    }
    case 'attack': {
      const t = z.unit(msg.id);
      if (!t || t.dead || !hostile(p, t)) {
        z.error(p.id, 'objetivo_invalido');
        return;
      }
      clearIntent(p);
      p.targetId = t.id;
      p.attackId = t.id;
      p.repathTimer = 0;
      return;
    }
    case 'pickup': {
      const l = z.entities.get(msg.id);
      if (l?.kind !== 'loot') return;
      if (l.ownerId !== p.id) {
        z.error(p.id, 'botin_ajeno');
        return;
      }
      clearIntent(p);
      p.pendingLoot = l.id;
      p.repathTimer = 0;
      return;
    }
    case 'cast': {
      const ab = ABILITIES[msg.ab];
      if (!ab || !p.cls.abilities.includes(ab.id)) {
        z.error(p.id, 'objetivo_invalido');
        return;
      }
      if (p.cast) return; // ya lanzando: se ignora (sin cola de hechizos)
      let targetId: number | null = null;
      if (ab.target === 'enemy') {
        targetId = msg.id ?? (p.targetId || null);
        const t = targetId !== null ? z.unit(targetId) : null;
        if (!t || t.dead || !hostile(p, t)) {
          z.error(p.id, 'sin_objetivo');
          return;
        }
        p.targetId = t.id;
      }
      const point =
        ab.target === 'point' && msg.x !== undefined && msg.y !== undefined
          ? { x: msg.x, y: msg.y }
          : null;
      if (ab.target === 'point' && !point) {
        z.error(p.id, 'sin_objetivo');
        return;
      }
      const err = checkCast(z, p, ab, targetId);
      if (err === 'fuera_alcance' && targetId !== null && !ab.minRange) {
        // Estilo Diablo: se acerca solo y lanza al entrar en alcance.
        clearIntent(p);
        p.pending = { ability: ab, targetId };
        p.repathTimer = 0;
        return;
      }
      if (err) {
        z.error(p.id, err);
        return;
      }
      if (ab.castTime > 0) clearIntent(p);
      beginCast(z, p, ab, targetId, point);
      return;
    }
    default:
      return;
  }
}

function clearIntent(p: PlayerEntity): void {
  p.attackId = null;
  p.pending = null;
  p.pendingLoot = null;
}

export function updatePlayer(z: Zone, p: PlayerEntity, dt: number): void {
  if (p.dead) {
    p.respawnTimer -= dt;
    if (p.respawnTimer <= 0) z.respawnPlayer(p);
    return;
  }
  for (const [k, v] of p.cds) {
    if (v <= dt) p.cds.delete(k);
    else p.cds.set(k, v - dt);
  }
  p.gcd = Math.max(0, p.gcd - dt);
  p.swingTimer = Math.max(0, p.swingTimer - dt);
  p.sinceManaSpent += dt;
  p.repathTimer -= dt;
  regen(p, dt);

  if (isStunned(p) || p.cast) return;

  if (p.pending) {
    const { ability, targetId } = p.pending;
    const t = z.unit(targetId);
    if (!t || t.dead) {
      p.pending = null;
    } else if (distTo(p, t) <= ability.range) {
      p.pending = null;
      p.path = [];
      const err = checkCast(z, p, ability, targetId);
      if (err) z.error(p.id, err);
      else beginCast(z, p, ability, targetId, null);
    } else {
      chase(z, p, t.x, t.y);
    }
    return;
  }

  if (p.pendingLoot !== null) {
    const l = z.entities.get(p.pendingLoot);
    if (l?.kind !== 'loot') {
      p.pendingLoot = null;
    } else if (distTo(p, l) <= LOOT_RANGE) {
      p.pendingLoot = null;
      p.path = [];
      z.pickup(p, l);
    } else {
      chase(z, p, l.x, l.y);
    }
    return;
  }

  if (p.attackId !== null) {
    const t = z.unit(p.attackId);
    if (!t || t.dead) {
      p.attackId = null;
      return;
    }
    if (p.dash) return;
    if (distTo(p, t) <= p.cls.weapon.range) {
      p.path = [];
      z.face(p, t.x, t.y);
      if (p.swingTimer <= 0) {
        p.swingTimer = p.cls.weapon.speed;
        meleeSwing(z, p, t);
      }
    } else {
      chase(z, p, t.x, t.y);
    }
  }
}

function chase(z: Zone, p: PlayerEntity, x: number, y: number): void {
  if (isRooted(p)) return;
  if (p.repathTimer <= 0 || p.path.length === 0) {
    p.repathTimer = 0.25;
    z.pathTo(p, x, y);
  }
}

/** Regeneracion por pulsos de 2 s (vida fuera de combate, mana con la regla de 5 s, ira decae). */
function regen(p: PlayerEntity, dt: number): void {
  p.combatTimer = Math.max(0, p.combatTimer - dt);
  p.regenAcc += dt;
  if (p.regenAcc < 2) return;
  p.regenAcc -= 2;
  if (p.combatTimer <= 0) p.hp = Math.min(p.mhp, p.hp + hpRegenPer2s(p.stats.spi, p.level));
  if (p.cls.resource === 'mana') {
    if (p.sinceManaSpent >= 5) p.res = Math.min(p.mres, p.res + manaRegenPer2s(p.stats.spi));
  } else if (p.combatTimer <= 0) {
    p.res = Math.max(0, p.res - 3);
  }
}
