// Buddy heel AI: a buddy is a real, server-simulated owned mob entity
// (src/sim/content/buddy_mobs.ts mints its MobTemplate) that follows using
// the EXACT SAME A*-pathed heel locomotion as a hunter/warlock pet
// (petFollow, pet_ai.ts) — obstacle avoidance, waypoint caching, and the
// stranded-pet teleport recovery, all reused verbatim, not reimplemented.
//
// Two differences from a real combat pet, both deliberate:
//  - It heels toward a fixed LEFT-AND-BEHIND offset point (buddyFollowTarget
//    below), not the owner's exact tile, so it keeps standing where the old
//    purely-cosmetic follower always stood (2026-08-27 owner request: same
//    side, only the locomotion under it changed from client-side geometry to
//    real server AI). petFollow's optional `targetOverride` param exists
//    solely for this call site; every real pet call site omits it and heels
//    on the owner's own position exactly as before.
//  - It carries zero combat: spawned hostile:false/idle and never dispatched
//    through updatePet's combat arm, so it never acquires a target, swings,
//    or takes threat. Nothing ever targets a non-hostile owned entity, so it
//    needs no threat-table cleanup on despawn either (contrast
//    despawnPersistentPet in pet_commands.ts).
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports (enforced by
// tests/architecture.test.ts).

import { type BuddyKey, normalizeBuddyKey } from '../content/buddies';
import { buddyTemplateId, BUDDY_TEMPLATE_IDS } from '../content/buddy_mobs';
import { MOBS } from '../data';
import { createMob } from '../entity';
import type { SimContext } from '../sim_context';
import type { Entity, Vec3 } from '../types';
import { petFollow } from './pet_ai';

// Local-space offset from the owner: +X is the owner's right, +Z is the
// owner's forward (Entity.facing's "0 = +Z" convention). Values match the
// retired render-only follower's own offset (src/render/buddy_follow.ts,
// BUDDY_FOLLOW_LEFT/BACK) so the buddy keeps standing on the same side.
const BUDDY_FOLLOW_LEFT = 2;
const BUDDY_FOLLOW_BACK = 1.2;

/** Exported for tests/buddies.test.ts's exact-geometry heel assertion; every
 *  in-module call site above is the only real caller. */
export function buddyFollowTarget(owner: Entity): Vec3 {
  const sinF = Math.sin(owner.facing);
  const cosF = Math.cos(owner.facing);
  return {
    x: owner.pos.x - BUDDY_FOLLOW_LEFT * cosF - BUDDY_FOLLOW_BACK * sinF,
    y: owner.pos.y,
    z: owner.pos.z + BUDDY_FOLLOW_LEFT * sinF - BUDDY_FOLLOW_BACK * cosF,
  };
}

/** True for the real buddy entity (never a hunter/warlock/mage pet or a
 *  delve companion): every buddy templateId is minted by buddy_mobs.ts and
 *  used nowhere else, so this is a plain Set membership check. */
export function isBuddyMob(mob: Entity): boolean {
  return mob.ownerId !== null && BUDDY_TEMPLATE_IDS.has(mob.templateId);
}

/** The owner's live buddy entity, or null. Scoped to buddy templateIds only
 *  (mirrors pet_commands.ts's petOf, which explicitly excludes this kind of
 *  entity so the two lookups never collide for a hunter with both a real
 *  pet and a buddy out). */
export function buddyOf(ctx: SimContext, ownerId: number): Entity | null {
  for (const e of ctx.entities.values()) {
    if (e.ownerId === ownerId && isBuddyMob(e)) return e;
  }
  return null;
}

/** Spawns `key`'s buddy for `owner`, replacing any buddy it already has out.
 *  Zero-stat, zero-loot, never hostile: nothing ever targets it. */
export function spawnBuddyEntity(ctx: SimContext, owner: Entity, key: BuddyKey): void {
  const existing = buddyOf(ctx, owner.id);
  if (existing) ctx.dropEntity(existing.id);
  const template = MOBS[buddyTemplateId(key)];
  if (!template) return;
  const buddy = createMob(ctx.nextId++, template, owner.level, buddyFollowTarget(owner));
  buddy.ownerId = owner.id;
  buddy.hostile = false;
  buddy.aiState = 'idle';
  buddy.facing = owner.facing;
  ctx.addEntity(buddy);
}

/** Despawns the owner's live buddy entity, if any (dismiss, re-summon of a
 *  different buddy, or the safety net in updateBuddyMob below). */
export function despawnBuddyEntity(ctx: SimContext, ownerId: number): void {
  const existing = buddyOf(ctx, ownerId);
  if (existing) ctx.dropEntity(existing.id);
}

/** Per-tick heel for a buddy entity: pure follow, no target acquisition, no
 *  combat. The dispatcher (mob/locomotion.ts) already gates on isStunned
 *  before reaching here, matching every other owned-entity branch. Despawns
 *  itself if the owner is gone, dead, or no longer has this exact buddy
 *  active — a belt-and-suspenders net alongside the explicit spawn/despawn
 *  calls in src/sim/buddies.ts, so a buddy can never outlive the identity
 *  flip that was supposed to replace or dismiss it.
 *
 *  Deliberately does NOT despawn on owner.dead: unlike a real combat pet
 *  (pet_owner_revive.ts's whole snapshot/corpse/revive round trip), a buddy
 *  has no HP of its own to lose and no revive command to owe, so it just
 *  keeps standing by its fallen owner and resumes heeling once they're back
 *  up — closer to the old purely-cosmetic follower's behavior (which never
 *  disappeared for any reason) than to the pet death handling. */
export function updateBuddyMob(ctx: SimContext, buddy: Entity): void {
  const owner = buddy.ownerId === null ? null : ctx.entities.get(buddy.ownerId);
  const activeKey = owner ? normalizeBuddyKey(owner.buddyKey) : '';
  if (!owner || !activeKey || buddyTemplateId(activeKey) !== buddy.templateId) {
    ctx.dropEntity(buddy.id);
    return;
  }
  petFollow(ctx, buddy, owner, buddyFollowTarget(owner));
}
