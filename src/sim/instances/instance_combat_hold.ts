// Instance combat hold: inside a claimed instance slot (a dungeon, or one raid
// room, since every Ignivar room is its own slot) a mob NEVER sheds an attacker
// by distance. Its hate table is slot-scoped: an attacker stays on it until they
// leave the slot (the exit portal, a room crossing, or any teleport out), die,
// or escape through stealth, and the mob never soft-leashes home. A mob that
// cannot get to its target, whether pinned by geometry (the unreachable stall)
// or held at its hard tether, holds in place in an evade stance: immune to
// damage (combat/damage.ts), still aggro'd, resuming the moment the target is
// back in reach. So kiting the instance around can neither reset the pull nor
// chip a pinned mob down for free, which is what a kited chain pull was being
// farmed for. The open world keeps the classic rules: the hate-table reach
// (threat.ts THREAT_DROP_RANGE), the soft leash, and the evade-home stall.
//
// Draws no rng; reads only the entity's position against the live instance
// claims through the seam.
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

/** The claim (exit id) of the instance slot `e` stands in, or null outside. */
export function instanceClaimOf(ctx: SimContext, e: Entity): number | null {
  return ctx.instanceClaimIdAt(e.pos);
}

/** Does this mob fight under the instance hold (it stands in a claimed slot)? */
export function holdsAggroInInstance(ctx: SimContext, mob: Entity): boolean {
  return instanceClaimOf(ctx, mob) !== null;
}

/** Has this attacker left the slot the mob fights in? Inside a slot the answer
 *  replaces the open-world reach test entirely. */
export function attackerLeftInstance(ctx: SimContext, mobClaim: number, attacker: Entity): boolean {
  return ctx.instanceClaimIdAt(attacker.pos) !== mobClaim;
}

/** Hold in place in an evade stance: immune, aggro intact, not swinging. Set
 *  every engaged tick the mob is out of reach of its target and cannot close
 *  (geometry or tether); released by the same reach / progress checks that
 *  reset the stall clock, and by every pull reset. Optional-true so the parity
 *  sampler never sees a resting value. */
export function pinInPlace(mob: Entity): void {
  mob.evadeInPlace = true;
  mob.autoAttack = false;
}

export function releasePin(mob: Entity): void {
  if (mob.evadeInPlace) delete mob.evadeInPlace;
}

export function isPinnedInPlace(mob: Entity): boolean {
  return mob.evadeInPlace === true;
}
