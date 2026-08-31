// The heroic claim through the REAL Ignivar door path (no dev bypass): the
// overworld keep door claims the forge lift, and every deeper room inherits
// that first claim's difficulty. The lift must therefore be heroic-eligible
// in HEROIC_DUNGEON_IDS, or claimDifficultyForDungeon silently clamps the
// whole chain to normal (the v0.41.0 regression: the forge-lift became the
// chain's first room without a heroic tuning record, and every suite entered
// deeper rooms through the dev arm, the one path that skips the clamp).
import { describe, expect, it } from 'vitest';
import { HEROIC_MOB_TUNING } from '../src/sim/content/dungeon_difficulty';
import { IGNIVAR_LIFT_RIDE_SECONDS } from '../src/sim/ignivar_forge_lift';
import { IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_LIFT_ROOM_ID } from '../src/sim/ignivar_raid_ids';
import { enterDungeon } from '../src/sim/instances/dungeons';
import { type InstanceSlot, type PlayerMeta, Sim } from '../src/sim/sim';
import type { DungeonDifficulty, Entity } from '../src/sim/types';

// A production-shaped sim: no devCommands, so every door decision below runs
// the live-server branch of enterDungeon (bypass stays false throughout).
function raidSim(): { sim: Sim; lead: PlayerMeta } {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false, noPlayer: true });
  const leadPid = sim.addPlayer('warrior', 'Lead');
  const lead = sim.players.get(leadPid)!;
  for (let i = 0; i < 4; i += 1) {
    const pid = sim.addPlayer('mage', `M${i}`);
    sim.partyInvite(pid, lead.entityId);
    sim.partyAccept(pid);
  }
  sim.convertPartyToRaid(lead.entityId);
  if (sim.ctx.partyOf(lead.entityId)?.raid !== true) throw new Error('test raid did not form');
  return { sim, lead };
}

function liveClaim(sim: Sim, dungeonId: string): InstanceSlot {
  const claim = sim.instances.find(
    (inst) => inst.dungeonId === dungeonId && inst.partyKey !== null,
  );
  if (!claim) throw new Error(`no live claim for ${dungeonId}`);
  return claim;
}

function drainedErrors(sim: Sim): string[] {
  return (sim.drainEvents() as { type: string; text?: string }[])
    .filter((event) => event.type === 'error')
    .map((event) => event.text ?? '');
}

// Walk the whole production path for one difficulty selection: the keep door
// onto the lift, the ride (the gate swaps open at the 1 Hz instance sweep),
// then the opened gate into the Halls. Returns the two claims' difficulties
// plus the Halls trash so the caller can assert the transform actually landed.
function walkIntoHalls(selected: DungeonDifficulty): {
  lift: DungeonDifficulty;
  halls: DungeonDifficulty;
  hallsMobs: Entity[];
  errors: string[];
} {
  const { sim, lead } = raidSim();
  if (selected === 'heroic') sim.setDungeonDifficulty('heroic', lead.entityId);
  // The difficulty toggle confirms through the toast channel; drain the setup
  // noise so the per-hop error capture below covers only the walk-in itself.
  sim.drainEvents();
  if (!enterDungeon(sim.ctx, IGNIVAR_LIFT_ROOM_ID, lead.entityId)) {
    throw new Error('lift entry failed');
  }
  // Capture errors per hop: a single drain at the end would let the drain
  // before the Halls hop silently discard anything the lift hop refused with.
  const errors = drainedErrors(sim);
  const lift = liveClaim(sim, IGNIVAR_LIFT_ROOM_ID).difficulty;
  for (let i = 0; i < 20 * (IGNIVAR_LIFT_RIDE_SECONDS + 2); i += 1) sim.tick();
  errors.push(...drainedErrors(sim));
  if (!enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, lead.entityId)) {
    throw new Error('Halls entry through the opened lift gate failed');
  }
  const halls = liveClaim(sim, IGNIVAR_FORGE_APPROACH_ID);
  const hallsMobs = halls.mobIds
    .map((id) => sim.entities.get(id))
    .filter((mob): mob is Entity => mob !== undefined);
  errors.push(...drainedErrors(sim));
  return { lift, halls: halls.difficulty, hallsMobs, errors };
}

describe('the Ignivar raid claims the selected difficulty through the real door', () => {
  it('a heroic selection claims a heroic lift, and the Halls inherit it', () => {
    const { lift, halls, hallsMobs, errors } = walkIntoHalls('heroic');
    expect(errors).toEqual([]);
    expect(lift).toBe('heroic');
    expect(halls).toBe('heroic');
    // The observable half of the claim: the Halls trash really spawned
    // through the heroic transform (every heroic mob pins to the tuning
    // level; the deeper rooms take their difficulty from the same
    // ignivarSourceClaim line this hop exercises).
    expect(hallsMobs.length).toBeGreaterThan(0);
    const heroicLevel = HEROIC_MOB_TUNING[IGNIVAR_FORGE_APPROACH_ID].level;
    for (const mob of hallsMobs) expect(mob.level).toBe(heroicLevel);
  });

  it('the default selection still claims normal all the way in', () => {
    const { lift, halls, errors } = walkIntoHalls('normal');
    expect(errors).toEqual([]);
    expect(lift).toBe('normal');
    expect(halls).toBe('normal');
  });
});
