// The per-tick "which players are in combat" derivation, the classic hate-table
// rule: a player is in combat while ANY living hostile mob still carries them
// (or their pet) on its hate table, not only while they are that mob's current
// target. Healing threat lands the healer on the table too, so a raid healer
// stays in combat for the whole fight. The flag only clears when the mob dies,
// evades home (which wipes its table), the player dies (dropped off every table),
// or an escape like Vanish deliberately strips them from the tables.
//
// Boss encounters add the raid-boss "zone in combat" rule: an engaged boss holds
// every living, nearby member of its attackers' groups in combat even if they
// never acted, so a member who parks at the back cannot drop combat and raise
// the raid through a "cannot be cast in combat" gate mid-fight. Trash mobs keep
// the plain hate-table rule (a bystander who never acted is never pulled in).
//
// Reads mob AND pet state after both updated this tick, so it runs from the
// coordinator's engaged pass (sim.ts), never from a slice that ticks earlier.
// Draws no rng.
import { MOBS } from '../data';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';
import { dist2d } from '../types';

// A pet only keeps its OWNER flagged in combat while it is actively trading blows
// (its combatTimer resets to 0 on every hit dealt/taken). A pet that merely holds a
// target it is chasing or can't reach stops dragging the owner into perpetual combat
// past this window, so the owner's out-of-combat health regen resumes. Matches the
// 5s combat-linger used for the owner's own inCombat flag.
export const PET_COMBAT_LINGER = 5;

// How far (yards, 2D) from an engaged boss a member of an attacker's group is
// held in combat. Comfortably past every heal / resurrection reach (40 yd) so
// nobody can stand just outside it and still act on the fight; still bounded so
// a group member elsewhere in the world is never flagged. Instance slots sit
// hundreds of yards apart, so this never reaches a neighbouring instance.
export const BOSS_ENCOUNTER_COMBAT_RANGE = 100;

/** A wild mob whose hate table currently holds its attackers in combat. */
export function mobHoldsCombat(mob: Entity): boolean {
  if (mob.dead || mob.ownerId !== null || !mob.hostile || !mob.inCombat) return false;
  // A mob walking home (or parked in 'evade' by the instance exit hold) is out of
  // the fight even when its table is intact.
  if (mob.aiState === 'evade' || mob.aiState === 'dead') return false;
  // A practice dummy never fights back; it must not hold anyone past the linger.
  return MOBS[mob.templateId]?.dummy !== true;
}

function isEncounterBoss(mob: Entity): boolean {
  const template = MOBS[mob.templateId];
  return template?.boss === true || template?.worldBoss === true;
}

/** The player behind a hate-table entry: the player itself, or a pet's owner. */
function playerBehind(ctx: SimContext, entryId: number): number | null {
  const entry = ctx.entities.get(entryId);
  if (!entry) return null;
  if (entry.kind === 'player') return entry.id;
  return entry.ownerId;
}

function holdHateTable(ctx: SimContext, mob: Entity, out: Set<number>): void {
  for (const id of mob.threat.keys()) {
    out.add(id);
    const owner = playerBehind(ctx, id);
    if (owner !== null) out.add(owner);
  }
  // The current target is normally on the table already (aggro seeds it); keep
  // it explicitly so a table pruned this tick cannot open a one-tick gap.
  if (mob.aggroTargetId !== null) {
    out.add(mob.aggroTargetId);
    const owner = playerBehind(ctx, mob.aggroTargetId);
    if (owner !== null) out.add(owner);
  }
}

function holdEncounterGroups(ctx: SimContext, boss: Entity, out: Set<number>): void {
  const seenParties = new Set<number>();
  for (const id of boss.threat.keys()) {
    const pid = playerBehind(ctx, id);
    if (pid === null) continue;
    const party = ctx.partyOf(pid);
    if (!party || seenParties.has(party.id)) continue;
    seenParties.add(party.id);
    for (const memberId of party.members) {
      const member = ctx.entities.get(memberId);
      if (!member || member.dead) continue;
      if (dist2d(member.pos, boss.pos) > BOSS_ENCOUNTER_COMBAT_RANGE) continue;
      out.add(memberId);
    }
  }
}

/**
 * Fill `out` with every entity id an engaged mob or fighting pet holds in combat
 * this tick. One pass over the entities instead of one scan per player; the
 * coordinator then sets each player's `inCombat` from the set plus their own
 * 5s linger.
 */
export function collectEngagedPids(ctx: SimContext, out: Set<number>): void {
  out.clear();
  for (const e of ctx.entities.values()) {
    if (e.kind !== 'mob' || e.dead) continue;
    if (e.ownerId !== null) {
      // A player's pet that is actively fighting keeps its owner in combat. A
      // pet merely holding a target it is not trading blows with (out of reach,
      // stale) must not freeze the owner's health regen indefinitely.
      if (e.aggroTargetId !== null && e.combatTimer < PET_COMBAT_LINGER) out.add(e.ownerId);
      continue;
    }
    if (!mobHoldsCombat(e)) continue;
    holdHateTable(ctx, e, out);
    if (isEncounterBoss(e)) holdEncounterGroups(ctx, e, out);
  }
}
