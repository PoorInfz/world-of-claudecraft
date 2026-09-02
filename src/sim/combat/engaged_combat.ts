// The per-tick "which players are in combat" derivation, the classic hate-table
// rule: a player is in combat while ANY living hostile mob still carries them
// (or their pet) on its hate table, not only while they are that mob's current
// target. Healing threat lands the healer on the table too, so a raid healer
// stays in combat for the whole fight. The flag only clears when the mob dies,
// evades home (which wipes its table), the player dies (dropped off every table
// by combat/damage.ts), or an escape like Vanish deliberately strips them from
// the tables (combat/effect_dispatch.ts). Like classic, the hold has no distance
// bound of its own: an attacker who tags a mob a raid keeps engaged and walks
// off stays in combat until that mob dies or resets.
//
// Boss encounters add the raid-boss "zone in combat" rule: an engaged boss holds
// every living, nearby member of its attackers' groups in combat even if they
// never acted, so a member who parks at the back cannot drop combat and raise
// the raid through a "cannot be cast in combat" gate mid-fight. Trash mobs keep
// the plain hate-table rule (a bystander who never acted is never pulled in).
//
// Reads mob AND pet state after both updated this tick, so it runs from the
// coordinator's engaged pass (sim.ts), never from a slice that ticks earlier.
// Draws no rng. The hate-table walks bump ctx.mobScanCounters.threatEntryVisits
// like the mob-AI walks in mob/targeting.ts, so the perf heartbeat's
// threatVisits token keeps counting every table entry visited per tick.
import { MOBS } from '../data';
import { questGateBlocksAggro } from '../mob/quest_gated_aggro';
import type { MobScanCounters } from '../mob/scan_counters';
import type { SimContext } from '../sim_context';
import type { Entity, MobTemplate } from '../types';
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
// hundreds of yards apart, so this never reaches a neighbouring instance. Measured
// flat (dist2d), so a member on another floor of the same instance still counts.
export const BOSS_ENCOUNTER_COMBAT_RANGE = 100;

/** A wild mob whose hate table currently holds its attackers in combat: engaged
 *  (in combat, or actively chasing / attacking / fleeing, which is what the
 *  coordinator's old target-only rule keyed on) and not walking home. */
function mobHoldsCombat(mob: Entity, template: MobTemplate | undefined): boolean {
  if (!mob.hostile) return false;
  // A mob walking home (or parked in 'evade' by the instance exit hold, hate
  // table intact) is out of the fight.
  if (mob.aiState === 'evade' || mob.aiState === 'dead') return false;
  const active = mob.aiState === 'chase' || mob.aiState === 'attack' || mob.aiState === 'flee';
  // A scripted boss parked at 'idle' for an intermission stays inCombat, and
  // keeps holding the raid through it.
  if (!active && !mob.inCombat) return false;
  // A practice dummy never fights back; it must not hold anyone past the linger.
  return template?.dummy !== true;
}

function isEncounterBoss(template: MobTemplate | undefined): boolean {
  return template?.boss === true || template?.worldBoss === true;
}

/** The player behind a hate-table entry: the player itself, or the player who
 *  owns a pet entry. A mob-owned add or an NPC entry resolves to nobody. */
function playerBehind(ctx: SimContext, entryId: number): number | null {
  const entry = ctx.entities.get(entryId);
  if (!entry) return null;
  if (entry.kind === 'player') return entry.id;
  if (entry.ownerId === null) return null;
  return ctx.entities.get(entry.ownerId)?.kind === 'player' ? entry.ownerId : null;
}

function holdEncounterGroup(
  ctx: SimContext,
  boss: Entity,
  pid: number,
  seenParties: Set<number>,
  out: Set<number>,
): void {
  const party = ctx.partyOf(pid);
  if (!party || seenParties.has(party.id)) return;
  seenParties.add(party.id);
  for (const memberId of party.members) {
    const member = ctx.entities.get(memberId);
    if (!member || member.dead) continue;
    if (dist2d(member.pos, boss.pos) > BOSS_ENCOUNTER_COMBAT_RANGE) continue;
    // A quest-gated boss never pulls a member its own damage gate would refuse
    // (the same rule healing threat applies in combat/heal.ts).
    if (questGateBlocksAggro(ctx.players, boss, member)) continue;
    out.add(memberId);
  }
}

// One walk of the mob's hate table: every entry (and the player behind a pet
// entry) is held, and for an encounter boss each attacker's group is held too.
function holdHateTable(
  ctx: SimContext,
  mob: Entity,
  encounterBoss: boolean,
  out: Set<number>,
  counters: MobScanCounters,
): void {
  // Allocated per engaged BOSS per tick only (never per add or per entry), so it
  // is deliberately a local rather than a hoisted scratch structure.
  const seenParties = encounterBoss ? new Set<number>() : null;
  for (const id of mob.threat.keys()) {
    counters.threatEntryVisits++;
    out.add(id);
    const pid = playerBehind(ctx, id);
    if (pid === null) continue;
    out.add(pid);
    if (seenParties) holdEncounterGroup(ctx, mob, pid, seenParties, out);
  }
  // The current target is normally on the table already (aggro seeds it); keep
  // it explicitly so a table pruned this tick cannot open a one-tick gap.
  if (mob.aggroTargetId !== null) {
    out.add(mob.aggroTargetId);
    const pid = playerBehind(ctx, mob.aggroTargetId);
    if (pid !== null) out.add(pid);
  }
}

/**
 * Fill `out` with every entity id an engaged mob or fighting pet holds in combat
 * this tick. One pass over the entities instead of one scan per player; the
 * coordinator then sets each player's `inCombat` from the set plus their own
 * 5s linger. The set may carry pet, mob, or departed ids too: readers only ever
 * ask `has(playerId)`.
 */
export function collectEngagedPids(ctx: SimContext, out: Set<number>): void {
  out.clear();
  // Resolved once per pass, not per entry: the ctx member is a live getter chain.
  const counters = ctx.mobScanCounters;
  for (const e of ctx.entities.values()) {
    if (e.kind !== 'mob' || e.dead) continue;
    if (e.ownerId !== null) {
      // A player's pet that is actively fighting keeps its owner in combat. A
      // pet merely holding a target it is not trading blows with (out of reach,
      // stale) must not freeze the owner's health regen indefinitely.
      if (e.aggroTargetId !== null && e.combatTimer < PET_COMBAT_LINGER) out.add(e.ownerId);
      continue;
    }
    // Cheap field gates first; the template lookup only lands on engaged mobs.
    if (!e.hostile || e.aiState === 'evade' || (e.aiState === 'idle' && !e.inCombat)) continue;
    const template = MOBS[e.templateId];
    if (!mobHoldsCombat(e, template)) continue;
    holdHateTable(ctx, e, isEncounterBoss(template), out, counters);
  }
}

/**
 * Whether an enemy currently holds this player in combat (as opposed to the
 * player's own post-event linger). Recomputes the pass on demand for the
 * command-driven readouts; never call it per tick, the engaged pass owns that.
 */
export function isHeldInCombat(ctx: SimContext, playerId: number): boolean {
  const held = new Set<number>();
  collectEngagedPids(ctx, held);
  return held.has(playerId);
}
